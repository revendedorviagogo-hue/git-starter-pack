import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Auto-Relogin for expired accounts (Token morto)
// Runs login + MFA verify using stored password + totp_secret
// ============================================================

const AUTH_URL = "https://auth.cocos.capital";
const API_URL = "https://api.cocos.capital";

const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NzA5NjAwLAogICJleHAiOiAxODgyNDc2MDAwCn0.GieFvIDlSbRw6-KvFX8xPEzqzhXgIQ0Hc-ELKvrVirs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROXY_POOL = [
  "http://x7gp3cl1hp-package-isp:rlbg07vmxj@isp-us.rainproxy.io:30",
];

let proxyIndex = Math.floor(Math.random() * PROXY_POOL.length);
let proxyEnabled = true;

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

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  const withTimeout = { ...init, signal: AbortSignal.timeout(12000) } as RequestInit;

  if (!proxyEnabled) {
    return fetch(url, withTimeout);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const proxy = nextProxy();
    try {
      const res = await fetch(url, {
        ...withTimeout,
        // @ts-ignore
        client: createProxyClient(proxy),
      });
      return res;
    } catch (e) {
      console.warn(`[RELOGIN-PROXY] ${proxy.split("@")[1]} failed: ${(e as Error).message}`);
    }
  }

  proxyEnabled = false;
  console.warn("[RELOGIN-PROXY] Disabled proxy pool, switching to direct fetch");
  return fetch(url, withTimeout);
}

// ---------- TOTP generation (same as client-side) ----------
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

async function isAccessTokenAlive(accessToken: string): Promise<boolean> {
  try {
    const userRes = await pfetch(`${AUTH_URL}/auth/v1/user`, {
      method: "GET",
      headers: authHeaders(accessToken),
    });
    if (!userRes.ok) return false;
    const userData = await userRes.json();
    return !!userData?.id;
  } catch {
    return false;
  }
}

async function refreshSession(refreshToken: string): Promise<{ access_token: string; refresh_token?: string } | null> {
  try {
    const refreshRes = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const refreshData = await refreshRes.json();
    if (!refreshRes.ok || !refreshData?.access_token) return null;
    return {
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token,
    };
  } catch {
    return null;
  }
}

// ---------- Relogin single account ----------
async function reloginAccount(
  supabase: any,
  account: {
    id: string;
    email: string;
    password: string | null;
    totp_secret: string | null;
    account_id: string | null;
    access_token: string | null;
    refresh_token: string | null;
  },
  index: number,
  total: number
): Promise<{ email: string; success: boolean; error?: string }> {
  console.log(`[RELOGIN] 🔑 (${index + 1}/${total}) ${account.email}`);

  // Step 0: validate existing access_token first
  if (account.access_token && await isAccessTokenAlive(account.access_token)) {
    await supabase.from("cocos_accounts").update({
      info_tag: null,
      last_refresh_at: new Date().toISOString(),
    }).eq("id", account.id);
    console.log(`[RELOGIN] ✅ ${account.email} token antigo ainda válido`);
    return { email: account.email, success: true };
  }

  // Step 0b: try refresh token before password login
  if (account.refresh_token) {
    const refreshed = await refreshSession(account.refresh_token);
    if (refreshed?.access_token) {
      let accountId = account.account_id || "";
      if (!accountId) {
        try {
          const meRes = await pfetch(`${API_URL}/api/v2/users/me`, { method: "GET", headers: apiHeaders(refreshed.access_token) });
          const meData = await meRes.json();
          if (meData?.id_accounts?.[0]) accountId = String(meData.id_accounts[0]);
        } catch { /* */ }
      }

      await supabase.from("cocos_accounts").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        account_id: accountId || account.account_id || null,
        info_tag: null,
        last_login_at: new Date().toISOString(),
        last_refresh_at: new Date().toISOString(),
      }).eq("id", account.id);

      console.log(`[RELOGIN] ✅ ${account.email} refresh token antigo OK`);
      return { email: account.email, success: true };
    }
  }

  if (!account.password) {
    console.log(`[RELOGIN] ❌ ${account.email} sem password para relogin`);
    return { email: account.email, success: false, error: "sem_password" };
  }

  // Step 1: Login with password
  const loginRes = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: account.email, password: account.password, gotrue_meta_security: {} }),
  });
  const loginData = await loginRes.json();

  if (!loginRes.ok || !loginData.access_token) {
    const errMsg = loginData?.error_description || loginData?.msg || "login failed";
    console.log(`[RELOGIN] ❌ ${account.email} login failed: ${errMsg}`);
    return { email: account.email, success: false, error: errMsg };
  }

  let accessToken = loginData.access_token;
  let refreshToken = loginData.refresh_token || "";

  // Step 2: Get MFA factors
  const userRes = await pfetch(`${AUTH_URL}/auth/v1/user`, { method: "GET", headers: authHeaders(accessToken) });
  const userData = await userRes.json();
  const factors = userData?.factors || [];
  const totpFactor = factors.find((f: any) => f.factor_type === "totp" && f.status === "verified");

  if (!totpFactor) {
    // No MFA — save tokens as-is
    await supabase.from("cocos_accounts").update({
      access_token: accessToken,
      refresh_token: refreshToken,
      info_tag: null,
      last_login_at: new Date().toISOString(),
      last_refresh_at: new Date().toISOString(),
    }).eq("id", account.id);
    console.log(`[RELOGIN] ✅ ${account.email} (no MFA)`);
    return { email: account.email, success: true };
  }

  // Step 3: MFA required but no totp_secret stored?
  if (!account.totp_secret) {
    // Save tokens from password login (partial access)
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
  const challengeData = await challengeRes.json();
  if (!challengeData?.id) {
    console.log(`[RELOGIN] ❌ ${account.email} challenge failed`);
    return { email: account.email, success: false, error: "challenge_failed" };
  }

  // Step 4: Generate TOTP and verify
  const totpCode = await generateTOTP(account.totp_secret);
  const verifyRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${totpFactor.id}/verify`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ challenge_id: challengeData.id, code: totpCode }),
  });
  const verifyData = await verifyRes.json();

  if (!verifyRes.ok || !verifyData.access_token) {
    console.log(`[RELOGIN] ❌ ${account.email} MFA verify failed`);
    return { email: account.email, success: false, error: "mfa_verify_failed" };
  }

  accessToken = verifyData.access_token;
  refreshToken = verifyData.refresh_token || refreshToken;

  // Step 5: Get account_id if missing
  let accountId = account.account_id || "";
  if (!accountId) {
    try {
      const meRes = await pfetch(`${API_URL}/api/v2/users/me`, { method: "GET", headers: apiHeaders(accessToken) });
      const meData = await meRes.json();
      if (meData?.id_accounts?.[0]) accountId = String(meData.id_accounts[0]);
    } catch { /* */ }
  }

  // Step 6: Update DB — clear expired tag, save new tokens
  await supabase.from("cocos_accounts").update({
    access_token: accessToken,
    refresh_token: refreshToken,
    account_id: accountId || account.account_id || null,
    info_tag: null,
    last_login_at: new Date().toISOString(),
    last_refresh_at: new Date().toISOString(),
  }).eq("id", account.id);

  console.log(`[RELOGIN] ✅ ${account.email} relogin + MFA OK`);
  return { email: account.email, success: true };
}

// ---------- Main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find accounts with expired/dead tags.
    // We'll first validate old access tokens, then try refresh token, and only then fallback to password login.
    const { data: accounts, error } = await supabase
      .from("cocos_accounts")
      .select("id, email, password, totp_secret, account_id, access_token, refresh_token, info_tag")
      .or("info_tag.ilike.%Token morto%,info_tag.ilike.%expirad%,info_tag.like.⚠️%,info_tag.like.❌%");

    if (error) {
      console.error("[RELOGIN] DB error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startTime = Date.now();
    const MAX_RUNTIME_MS = 130_000;

    const expired = (accounts || []).filter((a: any) => {
      const hasTag = String(a?.info_tag || "").includes("Token morto") || String(a?.info_tag || "").includes("expirad") || String(a?.info_tag || "").startsWith("⚠️") || String(a?.info_tag || "").startsWith("❌");
      const hasAnyCredential = !!a?.access_token || !!a?.refresh_token || !!a?.password;
      return hasTag && hasAnyCredential;
    });

    console.log(`[RELOGIN] 🔍 Found ${expired.length} expired accounts to relogin`);

    if (expired.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No expired accounts found", total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; success: boolean; error?: string }[] = [];

    // Process sequentially with runtime guard (avoid gateway timeout / failed fetch)
    for (let i = 0; i < expired.length; i++) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.warn(`[RELOGIN] ⏱️ runtime guard reached at ${i}/${expired.length}`);
        break;
      }

      const acct = expired[i];
      const result = await reloginAccount(supabase, acct as any, i, expired.length);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`[RELOGIN] ✅ Done: ${successCount} success, ${failCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      total: expired.length,
      processed: results.length,
      partial: results.length < expired.length,
      relogged: successCount,
      failed: failCount,
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
