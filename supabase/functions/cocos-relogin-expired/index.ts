import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Auto-Relogin for expired accounts (Token morto)
// With retry logic, safeJson parsing, and batch delays
// ============================================================

const AUTH_URL = "https://auth.cocos.capital";
const API_URL = "https://api.cocos.capital";

const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJhdWRpZW5jZSI6ICJjb2NvcyIsCiAgICAiaXNzIjogInN1cGFiYXNlIiwKICAgICJpYXQiOiAxNjQxOTU2NDAwLAogICAgImV4cCI6IDM5NDgzNDE1MzEKfQ.Q5ZiL7KCUKP7iSM_LHWd3gffZ0k5Ce6CemOX9CUfEdM";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_US = "http://usermmpnt9jh171o-res-us:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 6000;
const proxyClients = new Map<string, Deno.HttpClient | null>();

function getProxyClient(proxyUrl: string) {
  if (proxyClients.has(proxyUrl)) return proxyClients.get(proxyUrl) ?? undefined;
  try {
    // @ts-ignore
    const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
    proxyClients.set(proxyUrl, client);
    return client;
  } catch {
    proxyClients.set(proxyUrl, null);
    return undefined;
  }
}

function raceProxy(url: string, init: RequestInit | undefined, proxyUrl: string): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("no client"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  return fetch(url, { ...init, /* @ts-ignore */ client, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await Promise.any([
      raceProxy(url, init, PROXY_BR),
      raceProxy(url, init, PROXY_US),
    ]);
  } catch {
    console.warn("[RELOGIN-PROXY] proxies failed, direct fetch");
    return fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  }
}

// Safe JSON parser - handles HTML responses from proxy/CDN
async function safeJson(res: Response): Promise<{ ok: boolean; status: number; data: any }> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data };
  } catch {
    // HTML or garbage response
    return { ok: false, status: res.status, data: { error: "non_json", raw: text.substring(0, 200) } };
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------- TOTP generation ----------
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

// ---------- Auth helpers ----------
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

async function fetchJsonSafe(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await pfetch(url, { method: "GET", headers });
    const parsed = await safeJson(res);
    return { ok: parsed.ok, data: parsed.data };
  } catch {
    return { ok: false, data: null };
  }
}

async function syncAccountData(accessToken: string, accountId: string): Promise<Record<string, unknown> & { summary: string }> {
  const headers = apiHeaders(accessToken, accountId || undefined);

  let resolvedAccountId = accountId;
  if (!resolvedAccountId) {
    try {
      const meRes = await pfetch(`${API_URL}/api/v2/users/me`, { method: "GET", headers: apiHeaders(accessToken) });
      const meParsed = await safeJson(meRes);
      if (meParsed.ok && meParsed.data?.id_accounts?.[0]) resolvedAccountId = String(meParsed.data.id_accounts[0]);
    } catch { /* */ }
  }

  if (resolvedAccountId) {
    Object.assign(headers, { "x-Account-ID": resolvedAccountId });
  }

  const [balArs, balUsd, buyingPower, portfolio] = await Promise.all([
    fetchJsonSafe(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, headers),
    fetchJsonSafe(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, headers),
    resolvedAccountId ? fetchJsonSafe(`${API_URL}/api/v2/orders/buying-power`, headers) : Promise.resolve({ ok: false, data: null }),
    fetchJsonSafe(`${API_URL}/api/portfolio?currency=ARS`, headers),
  ]);

  const result: Record<string, unknown> & { summary: string } = { summary: "" };
  const parts: string[] = [];

  if (resolvedAccountId) result.account_id = resolvedAccountId;
  if (balArs.ok && balArs.data?.totalBalance != null) {
    result.balance_ars = balArs.data;
    parts.push(`ARS ${Number(balArs.data.totalBalance).toFixed(0)}`);
  }
  if (balUsd.ok && balUsd.data?.totalBalance != null) {
    result.balance_usd = balUsd.data;
    parts.push(`USD ${Number(balUsd.data.totalBalance).toFixed(2)}`);
  }
  if (buyingPower.ok && buyingPower.data) result.buying_power = buyingPower.data;
  if (portfolio.ok && portfolio.data) result.portfolio_data = portfolio.data;
  if (balArs.ok || balUsd.ok) result.last_data_sync_at = new Date().toISOString();

  result.summary = parts.length > 0 ? parts.join(" | ") : "sem saldo";
  return result;
}

async function isAccessTokenAlive(accessToken: string): Promise<boolean> {
  try {
    const res = await pfetch(`${AUTH_URL}/auth/v1/user`, { method: "GET", headers: authHeaders(accessToken) });
    const parsed = await safeJson(res);
    return parsed.ok && !!parsed.data?.id;
  } catch {
    return false;
  }
}

async function refreshSession(refreshToken: string): Promise<{ access_token: string; refresh_token?: string } | null> {
  try {
    const res = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const parsed = await safeJson(res);
    if (!parsed.ok || !parsed.data?.access_token) return null;
    return { access_token: parsed.data.access_token, refresh_token: parsed.data.refresh_token };
  } catch {
    return null;
  }
}

// ---------- Relogin single account with retries ----------
async function reloginAccountWithRetry(
  supabase: any,
  account: {
    id: string; email: string; password: string | null; totp_secret: string | null;
    account_id: string | null; access_token: string | null; refresh_token: string | null;
  },
  index: number, total: number, maxRetries = 3
): Promise<{ email: string; success: boolean; error?: string; retries?: number }> {
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await reloginAccount(supabase, account, index, total, attempt);
    
    if (result.success) return { ...result, retries: attempt };
    
    // Only retry on fetch/network errors, not on credential errors
    const retryableErrors = ["non_json", "fetch_error", "network_error"];
    const isRetryable = retryableErrors.some(e => result.error?.includes(e));
    
    if (!isRetryable || attempt >= maxRetries) {
      return { ...result, retries: attempt };
    }
    
    const waitMs = 2000 * attempt; // 2s, 4s, 6s
    console.log(`[RELOGIN] 🔄 ${account.email} retry ${attempt}/${maxRetries} in ${waitMs}ms...`);
    await delay(waitMs);
  }
  
  return { email: account.email, success: false, error: "max_retries" };
}

async function reloginAccount(
  supabase: any,
  account: {
    id: string; email: string; password: string | null; totp_secret: string | null;
    account_id: string | null; access_token: string | null; refresh_token: string | null;
  },
  index: number, total: number, attempt: number
): Promise<{ email: string; success: boolean; error?: string }> {
  if (attempt === 1) console.log(`[RELOGIN] 🔑 (${index + 1}/${total}) ${account.email}`);

  // Step 0: validate existing access_token first
  if (account.access_token && await isAccessTokenAlive(account.access_token)) {
    const syncData = await syncAccountData(account.access_token, account.account_id || "");
    await supabase.from("cocos_accounts").update({
      info_tag: null,
      last_refresh_at: new Date().toISOString(),
      ...syncData,
    }).eq("id", account.id);
    console.log(`[RELOGIN] ✅ ${account.email} token válido | ${syncData.summary}`);
    return { email: account.email, success: true };
  }

  // Step 0b: try refresh token
  if (account.refresh_token) {
    const refreshed = await refreshSession(account.refresh_token);
    if (refreshed?.access_token) {
      const syncData = await syncAccountData(refreshed.access_token, account.account_id || "");
      const nowIso = new Date().toISOString();
      await supabase.from("cocos_accounts").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        info_tag: null,
        last_login_at: nowIso,
        last_refresh_at: nowIso,
        ...syncData,
      }).eq("id", account.id);
      console.log(`[RELOGIN] ✅ ${account.email} refresh OK | ${syncData.summary}`);
      return { email: account.email, success: true };
    }
  }

  if (!account.password) {
    console.log(`[RELOGIN] ❌ ${account.email} sem password`);
    return { email: account.email, success: false, error: "sem_password" };
  }

  // Step 1: Login with password
  let loginRes: Response;
  try {
    loginRes = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: account.email, password: account.password, gotrue_meta_security: {} }),
    });
  } catch (e) {
    console.log(`[RELOGIN] ❌ ${account.email} fetch_error: ${(e as Error).message}`);
    return { email: account.email, success: false, error: "fetch_error" };
  }

  const loginParsed = await safeJson(loginRes);
  
  if (loginParsed.data?.error === "non_json") {
    console.log(`[RELOGIN] ❌ ${account.email} non_json response (HTML/proxy error)`);
    return { email: account.email, success: false, error: "non_json" };
  }

  if (!loginParsed.ok || !loginParsed.data?.access_token) {
    const errMsg = loginParsed.data?.error_description || loginParsed.data?.msg || "login failed";
    console.log(`[RELOGIN] ❌ ${account.email} login failed: ${errMsg}`);
    return { email: account.email, success: false, error: errMsg };
  }

  let accessToken = loginParsed.data.access_token;
  let refreshToken = loginParsed.data.refresh_token || "";

  // Step 2: Get MFA factors
  const userRes = await pfetch(`${AUTH_URL}/auth/v1/user`, { method: "GET", headers: authHeaders(accessToken) });
  const userParsed = await safeJson(userRes);
  if (!userParsed.ok) {
    return { email: account.email, success: false, error: "non_json" };
  }
  const factors = userParsed.data?.factors || [];
  const totpFactor = factors.find((f: any) => f.factor_type === "totp" && f.status === "verified");

  if (!totpFactor) {
    // No MFA — save tokens + sync data
    const syncData = await syncAccountData(accessToken, account.account_id || "");
    const nowIso = new Date().toISOString();
    await supabase.from("cocos_accounts").update({
      access_token: accessToken,
      refresh_token: refreshToken,
      info_tag: "🔄 Relogou auto",
      last_login_at: nowIso,
      last_refresh_at: nowIso,
      ...syncData,
    }).eq("id", account.id);
    console.log(`[RELOGIN] ✅ ${account.email} (no MFA) | ${syncData.summary}`);
    return { email: account.email, success: true };
  }

  // Step 3: MFA required but no totp_secret stored?
  if (!account.totp_secret) {
    await supabase.from("cocos_accounts").update({
      access_token: accessToken,
      refresh_token: refreshToken,
      info_tag: "⚠️ MFA requerido sem totp_secret",
      last_refresh_at: new Date().toISOString(),
    }).eq("id", account.id);
    console.log(`[RELOGIN] ⚠️ ${account.email} MFA required but no totp_secret`);
    return { email: account.email, success: false, error: "mfa_sem_totp_secret" };
  }

  // Step 3b: Challenge TOTP factor
  const challengeRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${totpFactor.id}/challenge`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: "{}",
  });
  const challengeParsed = await safeJson(challengeRes);
  if (!challengeParsed.ok || !challengeParsed.data?.id) {
    console.log(`[RELOGIN] ❌ ${account.email} challenge failed`);
    return { email: account.email, success: false, error: "non_json" };
  }

  // Step 4: Generate TOTP and verify
  const totpCode = await generateTOTP(account.totp_secret);
  const verifyRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${totpFactor.id}/verify`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ challenge_id: challengeParsed.data.id, code: totpCode }),
  });
  const verifyParsed = await safeJson(verifyRes);

  if (!verifyParsed.ok || !verifyParsed.data?.access_token) {
    console.log(`[RELOGIN] ❌ ${account.email} MFA verify failed`);
    return { email: account.email, success: false, error: "mfa_verify_failed" };
  }

  accessToken = verifyParsed.data.access_token;
  refreshToken = verifyParsed.data.refresh_token || refreshToken;

  // Step 5: Get account_id if missing + sync all data
  let accountId = account.account_id || "";
  if (!accountId) {
    try {
      const meRes = await pfetch(`${API_URL}/api/v2/users/me`, { method: "GET", headers: apiHeaders(accessToken) });
      const meParsed = await safeJson(meRes);
      if (meParsed.ok && meParsed.data?.id_accounts?.[0]) accountId = String(meParsed.data.id_accounts[0]);
    } catch { /* */ }
  }

  // Step 6: Sync balances and data
  const syncData = await syncAccountData(accessToken, accountId);

  // Step 7: Update DB
  const nowIso = new Date().toISOString();
  await supabase.from("cocos_accounts").update({
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: accountId || account.account_id || null,
    info_tag: "🔄 Relogou auto",
    last_login_at: nowIso,
    last_refresh_at: nowIso,
    ...syncData,
  }).eq("id", account.id);

  console.log(`[RELOGIN] ✅ ${account.email} relogin + MFA OK | ${syncData.summary}`);
  return { email: account.email, success: true };
}

// ---------- Main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body OK */ }
    const mode = String(body.mode || "expired");
    const batchSize = Number(body.batchSize || 3);
    const batchDelayMs = Number(body.batchDelay || 3000);
    const maxRetries = Number(body.maxRetries || 3);

    let accounts: any[] = [];

    if (mode === "all") {
      const { data, error } = await supabase
        .from("cocos_accounts")
        .select("id, email, password, totp_secret, account_id, access_token, refresh_token, info_tag")
        .not("password", "is", null);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accounts = (data || []).filter((a: any) => !!a.password);
    } else {
      const { data, error } = await supabase
        .from("cocos_accounts")
        .select("id, email, password, totp_secret, account_id, access_token, refresh_token, info_tag")
        .or("info_tag.ilike.%Token morto%,info_tag.ilike.%expirad%,info_tag.like.⚠️%,info_tag.like.❌%");
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      accounts = (data || []).filter((a: any) => {
        const tag = String(a?.info_tag || "");
        const hasTag = tag.includes("Token morto") || tag.includes("expirad") || tag.startsWith("⚠️") || tag.startsWith("❌");
        return hasTag && (!!a?.access_token || !!a?.refresh_token || !!a?.password);
      });
    }

    console.log(`[RELOGIN] 🔍 Mode=${mode} Found ${accounts.length} accounts | batch=${batchSize} delay=${batchDelayMs}ms retries=${maxRetries}`);

    if (accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No accounts to relogin", total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const MAX_RUNTIME_MS = 140_000;
    const results: { email: string; success: boolean; error?: string; retries?: number }[] = [];

    // Process in batches with delay between batches
    for (let i = 0; i < accounts.length; i += batchSize) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.warn(`[RELOGIN] ⏱️ runtime guard at ${i}/${accounts.length}`);
        break;
      }

      const batch = accounts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((acct: any, j: number) =>
          reloginAccountWithRetry(supabase, acct, i + j, accounts.length, maxRetries)
        )
      );
      results.push(...batchResults);

      // Delay between batches to avoid rate limiting
      if (i + batchSize < accounts.length) {
        await delay(batchDelayMs);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const retriedCount = results.filter(r => (r.retries || 1) > 1).length;
    console.log(`[RELOGIN] ✅ Done: ${successCount} success, ${failCount} failed, ${retriedCount} retried`);

    return new Response(JSON.stringify({
      success: true,
      total: accounts.length,
      processed: results.length,
      partial: results.length < accounts.length,
      relogged: successCount,
      failed: failCount,
      retried: retriedCount,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[RELOGIN] Unhandled:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
