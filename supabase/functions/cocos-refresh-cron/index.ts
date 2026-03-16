import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Cocos Token Refresh + Balance Sync CRON
// PRIORITY: accounts with balance are refreshed FIRST
// SAFETY: never overwrite a valid token with null/empty
// ============================================================

const AUTH_URL = "https://auth.cocos.capital";
const API_URL = "https://api.cocos.capital";

const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJhdWRpZW5jZSI6ICJjb2NvcyIsCiAgICAiaXNzIjogInN1cGFiYXNlIiwKICAgICJpYXQiOiAxNjQxOTU2NDAwLAogICAgImV4cCI6IDM5NDgzNDE1MzEKfQ.Q5ZiL7KCUKP7iSM_LHWd3gffZ0k5Ce6CemOX9CUfEdM";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 1500;
const FETCH_ACCOUNTS_LIMIT = 1000;
const MAX_ACCOUNTS_PER_RUN = 200;

// ---------- TOTP generation for auto-relogin ----------
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=-]/g, "").toUpperCase();
  const bits: number[] = [];
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1);
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
    bytes[i] = byte;
  }
  return bytes;
}

async function generateTOTP(base32Secret: string): Promise<string> {
  const secret = base32Decode(base32Secret);
  const time = Math.floor(Date.now() / 1000 / 30);
  const timeBuffer = new ArrayBuffer(8);
  new DataView(timeBuffer).setUint32(4, time, false);
  const key = await crypto.subtle.importKey("raw", secret.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, timeBuffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, "0");
}

// ---------- Proxy ----------
const PROXY_POOL = [
  "http://usermmpnt9jh171o-res-ar:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959",
];

let proxyIndex = Math.floor(Math.random() * PROXY_POOL.length);

function nextProxy(): string {
  const p = PROXY_POOL[proxyIndex % PROXY_POOL.length];
  proxyIndex++;
  return p;
}

function createProxyClient(proxyUrl: string) {
  try {
    // @ts-ignore
    return Deno.createHttpClient({ proxy: { url: proxyUrl } });
  } catch {
    return undefined;
  }
}

async function pfetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = url.toString();
  for (let attempt = 0; attempt < PROXY_POOL.length; attempt++) {
    const proxy = nextProxy();
    const client = createProxyClient(proxy);
    if (!client) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(targetUrl, { ...init, /* @ts-ignore */ client, signal: controller.signal });
      return res;
    } catch (e) {
      console.warn(`[CRON-PROXY] ${proxy.split("@")[1]} failed (${attempt + 1}): ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return fetch(targetUrl, init);
}

// ---------- API helpers ----------
function authHeaders(token?: string): Record<string, string> {
  return {
    accept: "*/*",
    "content-type": "application/json;charset=UTF-8",
    apikey: COCOS_ANON_KEY,
    authorization: `Bearer ${token || COCOS_ANON_KEY}`,
    "User-Agent": "okhttp/4.12.0",
    "Accept-Encoding": "gzip",
    "Connection": "Keep-Alive",
    "x-client-info": "supabase-js-react-native/2.75.0",
    "x-supabase-api-version": "2024-01-01",
  };
}

function apiHeaders(accessToken: string, accountId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "Authorization": `Bearer ${accessToken}`,
    "Host": "api.cocos.capital",
    "User-Agent": "okhttp/4.12.0",
    "Accept-Encoding": "gzip",
    "Connection": "Keep-Alive",
    "x-platform": "android",
    "x-store-version": "3.5.0",
    "x-update-id": "2aeafeab-d92b-45b9-b043-f96f184c6461",
  };
  if (accountId) h["x-Account-ID"] = accountId;
  return h;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await pfetch(url, { method: "GET", headers });
    if (!res.ok) return { ok: false, data: null };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, data: null };
  }
}

// ---------- Auto-relogin when refresh token is dead ----------
async function attemptRelogin(
  supabase: any,
  account: { id: string; email: string; password: string | null; totp_secret: string | null; account_id: string | null }
): Promise<{ access_token: string; refresh_token: string } | null> {
  if (!account.password) return null;

  console.log(`[CRON] 🔑 Attempting relogin for ${account.email}`);

  try {
    // Step 1: Login with password
    const loginRes = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: account.email, password: account.password, gotrue_meta_security: {} }),
    });
    const loginData = await loginRes.json();

    if (!loginRes.ok || !loginData.access_token) {
      const errMsg = loginData?.error_description || loginData?.msg || "login failed";
      console.log(`[CRON] ❌ ${account.email} relogin failed: ${errMsg}`);
      return null;
    }

    let accessToken = loginData.access_token;
    let refreshToken = loginData.refresh_token || "";

    // Step 2: Check for MFA
    const userRes = await pfetch(`${AUTH_URL}/auth/v1/user`, { method: "GET", headers: authHeaders(accessToken) });
    const userData = await userRes.json();
    const factors = userData?.factors || [];
    const totpFactor = factors.find((f: any) => f.factor_type === "totp" && f.status === "verified");

    if (!totpFactor) {
      // No MFA needed
      console.log(`[CRON] ✅ ${account.email} relogin OK (no MFA)`);
      return { access_token: accessToken, refresh_token: refreshToken };
    }

    if (!account.totp_secret) {
      console.log(`[CRON] ⚠️ ${account.email} MFA required but no totp_secret`);
      return null;
    }

    // Step 3: TOTP challenge + verify
    const challengeRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${totpFactor.id}/challenge`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: "{}",
    });
    const challengeData = await challengeRes.json();
    if (!challengeData?.id) return null;

    const totpCode = await generateTOTP(account.totp_secret);
    const verifyRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${totpFactor.id}/verify`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ challenge_id: challengeData.id, code: totpCode }),
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.access_token) {
      console.log(`[CRON] ❌ ${account.email} MFA verify failed`);
      return null;
    }

    console.log(`[CRON] ✅ ${account.email} relogin + MFA OK`);
    return {
      access_token: verifyData.access_token,
      refresh_token: verifyData.refresh_token || refreshToken,
    };
  } catch (e) {
    console.log(`[CRON] ❌ ${account.email} relogin error: ${(e as Error).message}`);
    return null;
  }
}

// ---------- Refresh + sync single account ----------
async function refreshAndSync(
  supabase: any,
  account: {
    id: string;
    email: string;
    refresh_token: string;
    account_id: string | null;
    password: string | null;
    totp_secret: string | null;
    balance_ars: any;
    balance_usd: any;
  },
  index: number,
  total: number
): Promise<{ email: string; success: boolean; balanceSynced: boolean; relogged?: boolean; error?: string }> {
  console.log(`[CRON] 🔄 (${index + 1}/${total}) ${account.email}`);

  let newAccessToken = "";
  let newRefreshToken = "";
  let relogged = false;

  // Step 1: Try refresh token (3 attempts with backoff)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json;charset=UTF-8",
          apikey: COCOS_ANON_KEY,
          "User-Agent": "okhttp/4.12.0",
          "Accept-Encoding": "gzip",
          "Connection": "Keep-Alive",
        },
        body: JSON.stringify({ refresh_token: account.refresh_token }),
      });
      const data = await res.json();

      if (res.ok && data.access_token && data.refresh_token) {
        newAccessToken = data.access_token;
        newRefreshToken = data.refresh_token;
        break;
      }

      const errMsg = data?.error_description || data?.error || data?.msg || "unknown";

      // Rate limited — don't mark as dead, just skip
      if (errMsg.includes("solicitudes") || errMsg.includes("rate") || errMsg.includes("Too many")) {
        console.log(`[CRON] 🛑 ${account.email} RATE LIMITED`);
        // SAFETY: only update last_refresh_at, never touch tokens
        await supabase.from("cocos_accounts").update({ last_refresh_at: new Date().toISOString() }).eq("id", account.id);
        return { email: account.email, success: false, balanceSynced: false, error: `RATE_LIMIT: ${errMsg}` };
      }

      // Already used — another process consumed it, skip without damage
      if (errMsg.includes("Already Used")) {
        console.log(`[CRON] ⏭️ ${account.email} token already used, skipping`);
        return { email: account.email, success: false, balanceSynced: false, error: "already_used" };
      }

      // Token dead — try relogin before giving up
      if (errMsg.includes("Refresh Token Not Found") || errMsg.includes("Invalid Refresh Token")) {
        console.log(`[CRON] ⚠️ ${account.email} refresh token dead, trying relogin...`);
        const reloginResult = await attemptRelogin(supabase, account);
        if (reloginResult) {
          newAccessToken = reloginResult.access_token;
          newRefreshToken = reloginResult.refresh_token;
          relogged = true;
          break;
        }
        // Relogin failed — mark as dead but NEVER clear existing tokens
        await supabase.from("cocos_accounts").update({
          info_tag: `⚠️ Token morto + relogin falhou`,
          last_refresh_at: new Date().toISOString(),
        }).eq("id", account.id);
        return { email: account.email, success: false, balanceSynced: false, error: "token_dead_relogin_failed" };
      }

      // Other error — retry with backoff
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      // All retries exhausted — NEVER clear tokens, just update timestamp
      await supabase.from("cocos_accounts").update({ last_refresh_at: new Date().toISOString() }).eq("id", account.id);
      return { email: account.email, success: false, balanceSynced: false, error: errMsg };
    } catch (e) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { email: account.email, success: false, balanceSynced: false, error: (e as Error).message };
    }
  }

  // SAFETY: if we still don't have tokens, do NOT touch the DB tokens
  if (!newAccessToken || !newRefreshToken) {
    return { email: account.email, success: false, balanceSynced: false, error: "no_token_after_retries" };
  }

  // Step 2: Get account_id if missing
  let accountId = account.account_id || "";
  if (!accountId) {
    const { ok, data } = await fetchJson(`${API_URL}/api/v2/users/me`, apiHeaders(newAccessToken));
    if (ok && data?.id_accounts?.[0]) {
      accountId = String(data.id_accounts[0]);
    }
  }

  // Step 3: Fetch balances in parallel
  const headers = apiHeaders(newAccessToken, accountId || undefined);
  const [balArs, balUsd, buyingPower, portfolio] = await Promise.all([
    fetchJson(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, headers),
    fetchJson(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, headers),
    accountId ? fetchJson(`${API_URL}/api/v2/orders/buying-power`, headers) : Promise.resolve({ ok: false, data: null }),
    fetchJson(`${API_URL}/api/portfolio?currency=ARS`, headers),
  ]);

  const balanceSynced = balArs.ok || balUsd.ok;

  // Step 4: SAFETY — build update payload carefully, never write null tokens
  const updatePayload: Record<string, unknown> = {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    last_refresh_at: new Date().toISOString(),
    info_tag: null, // clear any previous error tag
  };

  if (relogged) updatePayload.last_login_at = new Date().toISOString();
  if (accountId) updatePayload.account_id = accountId;
  if (balArs.ok && balArs.data) updatePayload.balance_ars = balArs.data;
  if (balUsd.ok && balUsd.data) updatePayload.balance_usd = balUsd.data;
  if (buyingPower.ok && buyingPower.data) updatePayload.buying_power = buyingPower.data;
  if (portfolio.ok && portfolio.data) updatePayload.portfolio_data = portfolio.data;
  if (balanceSynced) updatePayload.last_data_sync_at = new Date().toISOString();

  await supabase.from("cocos_accounts").update(updatePayload).eq("id", account.id);

  const arsTotal = balArs.data?.totalBalance != null ? `ARS ${Number(balArs.data.totalBalance).toFixed(0)}` : "—";
  const usdTotal = balUsd.data?.totalBalance != null ? `USD ${Number(balUsd.data.totalBalance).toFixed(2)}` : "—";
  console.log(`[CRON] ✅ (${index + 1}/${total}) ${account.email} | ${arsTotal} | ${usdTotal}${relogged ? " [RELOGGED]" : ""}`);

  return { email: account.email, success: true, balanceSynced, relogged };
}

// ---------- Sort accounts: balance holders first ----------
function sortByBalancePriority(accounts: any[]): any[] {
  return accounts.sort((a, b) => {
    const aBalance = getAccountTotalUsd(a);
    const bBalance = getAccountTotalUsd(b);
    // Higher balance = higher priority (processed first)
    if (aBalance !== bBalance) return bBalance - aBalance;
    // Then by oldest refresh
    const aRefresh = a.last_refresh_at ? new Date(a.last_refresh_at).getTime() : 0;
    const bRefresh = b.last_refresh_at ? new Date(b.last_refresh_at).getTime() : 0;
    return aRefresh - bRefresh;
  });
}

function getAccountTotalUsd(account: any): number {
  try {
    const usd = account.balance_usd?.totalBalance;
    if (typeof usd === "number" && usd > 0) return usd;
  } catch { /* */ }
  try {
    const ars = account.balance_ars?.totalBalance;
    if (typeof ars === "number" && ars > 0) return ars / 1400; // rough ARS->USD
  } catch { /* */ }
  return 0;
}

// ---------- Main handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL accounts with valid refresh tokens
    // Include password + totp_secret for auto-relogin fallback
    const { data: accounts, error } = await supabase
      .from("cocos_accounts")
      .select("id, email, refresh_token, last_refresh_at, info_tag, account_id, password, totp_secret, balance_ars, balance_usd")
      .not("refresh_token", "is", null)
      .neq("refresh_token", "")
      .limit(MAX_ACCOUNTS_PER_RUN);

    if (error) {
      console.error("[CRON] Error fetching accounts:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PRIORITY SORT: accounts with balance first, then oldest refresh
    const sortedAccounts = sortByBalancePriority(accounts || []);

    const withBalance = sortedAccounts.filter(a => getAccountTotalUsd(a) > 0).length;
    console.log(`[CRON] 📊 ${sortedAccounts.length} accounts to refresh (${withBalance} with balance — PRIORITY)`);

    if (sortedAccounts.length === 0) {
      return new Response(JSON.stringify({ success: true, refreshed: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; success: boolean; balanceSynced: boolean; relogged?: boolean; error?: string }[] = [];
    let rateLimited = false;

    for (let batchStart = 0; batchStart < sortedAccounts.length; batchStart += BATCH_SIZE) {
      if (rateLimited) break;

      const batch = sortedAccounts.slice(batchStart, batchStart + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map((account: any, idx: number) =>
          refreshAndSync(supabase, account, batchStart + idx, sortedAccounts.length)
        )
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.error?.startsWith("RATE_LIMIT")) {
          rateLimited = true;
        }
      }

      if (batchStart + BATCH_SIZE < sortedAccounts.length && !rateLimited) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const balanceSyncCount = results.filter(r => r.balanceSynced).length;
    const failCount = results.filter(r => !r.success).length;
    const reloggedCount = results.filter(r => r.relogged).length;

    console.log(`[CRON] ✅ Done: ${successCount} refreshed, ${reloggedCount} relogged, ${balanceSyncCount} balances, ${failCount} failed${rateLimited ? " (RATE LIMITED)" : ""}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: sortedAccounts.length,
        processed: results.length,
        refreshed: successCount,
        relogged: reloggedCount,
        balances_synced: balanceSyncCount,
        failed: failCount,
        rate_limited: rateLimited,
        priority_accounts: withBalance,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[CRON] Unhandled error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
