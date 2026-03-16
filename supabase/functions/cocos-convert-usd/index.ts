import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Cocos Convert All USD → ARS via MEP
// Routes through cocos-auth edge function for reliable proxy
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTH_URL = "https://api.cocos.capital";
const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJhdWRpZW5jZSI6ICJjb2NvcyIsCiAgICAiaXNzIjogInN1cGFiYXNlIiwKICAgICJpYXQiOiAxNjQxOTU2NDAwLAogICAgImV4cCI6IDM5NDgzNDE1MzEKfQ.Q5ZiL7KCUKP7iSM_LHWd3gffZ0k5Ce6CemOX9CUfEdM";

const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_US = "http://usermmpnt9jh171o-res-us:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 5000;
const DIRECT_TIMEOUT_MS = 8000;

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

function fetchViaProxy(url: string, init: RequestInit | undefined, proxyUrl: string): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("no client"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  return fetch(url, { ...init, /* @ts-ignore */ client, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  const method = String(init?.method || "GET").toUpperCase();
  const directFetch = async (delayMs = 0) => {
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
    try { return await fetch(url, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  try {
    if (method === "GET" || method === "HEAD") {
      return await Promise.any([
        fetchViaProxy(url, init, PROXY_BR),
        fetchViaProxy(url, init, PROXY_US),
        directFetch(800),
      ]);
    }
    for (const p of [PROXY_BR, PROXY_US]) {
      try { return await fetchViaProxy(url, init, p); } catch { /* next */ }
    }
    return await directFetch(0);
  } catch {
    return fetch(url, init || {});
  }
}

const API_URL = "https://api.cocos.capital";

function apiHeaders(accessToken: string, accountId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
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

// TOTP generation
function generateTOTP(secret: string): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const decoded: number[] = [];
  let bits = 0, value = 0;
  for (const c of secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | base32Chars.indexOf(c);
    bits += 5;
    if (bits >= 8) { bits -= 8; decoded.push((value >>> bits) & 0xff); }
  }
  const key = new Uint8Array(decoded);
  const time = Math.floor(Date.now() / 1000 / 30);
  const msg = new Uint8Array(8);
  let t = time;
  for (let i = 7; i >= 0; i--) { msg[i] = t & 0xff; t >>>= 8; }
  // HMAC-SHA1
  const blockSize = 64;
  let keyBytes = key;
  if (keyBytes.length > blockSize) {
    const h = sha1(keyBytes);
    keyBytes = h;
  }
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36;
    opad[i] = paddedKey[i] ^ 0x5c;
  }
  const inner = new Uint8Array(blockSize + msg.length);
  inner.set(ipad); inner.set(msg, blockSize);
  const innerHash = sha1(inner);
  const outer = new Uint8Array(blockSize + 20);
  outer.set(opad); outer.set(innerHash, blockSize);
  const hmac = sha1(outer);
  const offset = hmac[19] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset+1] & 0xff) << 16 | (hmac[offset+2] & 0xff) << 8 | (hmac[offset+3] & 0xff)) % 1000000;
  return code.toString().padStart(6, "0");
}

function sha1(data: Uint8Array): Uint8Array {
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const ml = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data); padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, ml, false);
  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(80);
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) { const x = w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16]; w[j] = (x << 1) | (x >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const result = new Uint8Array(20);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0); rv.setUint32(4, h1); rv.setUint32(8, h2); rv.setUint32(12, h3); rv.setUint32(16, h4);
  return result;
}

async function fullRelogin(email: string, password: string, totpSecret: string): Promise<{ access_token: string; refresh_token: string; account_id: string } | null> {
  try {
    // Step 1: Login
    const loginRes = await pfetch(`${API_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "accept": "*/*", "content-type": "application/json;charset=UTF-8", apikey: COCOS_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.access_token) return null;

    // Step 2: MFA challenge
    const factors = loginData.user?.factors || [];
    const totpFactor = factors.find((f: any) => f.factor_type === "totp");
    if (!totpFactor) return null;

    const challengeRes = await pfetch(`${API_URL}/auth/v1/factors/${totpFactor.id}/challenge`, {
      method: "POST",
      headers: { "accept": "*/*", "content-type": "application/json;charset=UTF-8", apikey: COCOS_ANON_KEY, authorization: `Bearer ${loginData.access_token}` },
      body: "{}",
    });
    const challengeData = await challengeRes.json();
    if (!challengeRes.ok || !challengeData.id) return null;

    // Step 3: MFA verify
    const totp = generateTOTP(totpSecret);
    const verifyRes = await pfetch(`${API_URL}/auth/v1/factors/${totpFactor.id}/verify`, {
      method: "POST",
      headers: { "accept": "*/*", "content-type": "application/json;charset=UTF-8", apikey: COCOS_ANON_KEY, authorization: `Bearer ${loginData.access_token}` },
      body: JSON.stringify({ challenge_id: challengeData.id, code: totp }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.access_token) return null;

    // Step 4: Get account ID
    const profileRes = await pfetch(`${API_URL}/api/v2/users/me`, {
      method: "GET",
      headers: apiHeaders(verifyData.access_token),
    });
    let accountId = "";
    if (profileRes.ok) {
      const profile = await profileRes.json();
      accountId = String(profile?.accounts?.[0]?.id || profile?.id || "");
    }

    return { access_token: verifyData.access_token, refresh_token: verifyData.refresh_token, account_id: accountId };
  } catch (e) {
    console.log(`[CONVERT] Relogin failed for ${email}: ${(e as Error).message}`);
    return null;
  }
}

interface ConvertResult {
  email: string;
  usd_cash: number;
  converted: number;
  orders: string[];
  errors: string[];
  tokenRefreshed: boolean;
  method: string;
}

async function convertAccount(
  supabase: any,
  account: { id: string; email: string; access_token: string; refresh_token: string; account_id: string | null; password?: string; totp_secret?: string },
): Promise<ConvertResult> {
  const result: ConvertResult = {
    email: account.email, usd_cash: 0, converted: 0,
    orders: [], errors: [], tokenRefreshed: false, method: "",
  };

  // ── Step 0: Refresh token, fallback to full relogin ──
  let accessToken = account.access_token;
  let accountId = account.account_id || "";
  try {
    const res = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "accept": "*/*", "content-type": "application/json;charset=UTF-8",
        apikey: COCOS_ANON_KEY, "User-Agent": "okhttp/4.12.0",
      },
      body: JSON.stringify({ refresh_token: account.refresh_token }),
    });
    const data = await res.json();
    if (res.ok && data.access_token && data.refresh_token) {
      accessToken = data.access_token;
      result.tokenRefreshed = true;
      await supabase.from("cocos_accounts").update({
        access_token: accessToken,
        refresh_token: data.refresh_token,
        last_refresh_at: new Date().toISOString(),
      }).eq("id", account.id);
    } else if (account.password && account.totp_secret) {
      console.log(`[CONVERT] 🔑 Refresh failed for ${account.email}, trying full relogin...`);
      const login = await fullRelogin(account.email, account.password, account.totp_secret);
      if (login) {
        accessToken = login.access_token;
        accountId = login.account_id || accountId;
        result.tokenRefreshed = true;
        await supabase.from("cocos_accounts").update({
          access_token: login.access_token,
          refresh_token: login.refresh_token,
          account_id: login.account_id || accountId,
          last_login_at: new Date().toISOString(),
          last_refresh_at: new Date().toISOString(),
        }).eq("id", account.id);
        console.log(`[CONVERT] ✅ Relogin OK for ${account.email}`);
      } else {
        console.log(`[CONVERT] ❌ Relogin also failed for ${account.email}`);
      }
    }
  } catch { /* use existing token */ }

  const headers = apiHeaders(accessToken, accountId || undefined);

  // ── Step 1: Get USD balance ──
  let usdCash = 0;
  try {
    const res = await pfetch(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, { method: "GET", headers });
    if (!res.ok) {
      if (res.status === 401) { result.errors.push("401 (token expirado)"); return result; }
      result.errors.push(`Balance: ${res.status}`);
      return result;
    }
    const bal = await res.json();
    usdCash = bal?.cashBalance || 0;
    result.usd_cash = usdCash;
  } catch (e) {
    result.errors.push(`Balance: ${(e as Error).message.slice(0, 40)}`);
    return result;
  }

  if (usdCash < 1) return result;

  // ── Step 2: Get FX prices ──
  let method = "";
  try {
    const res = await pfetch(`${API_URL}/api/v1/usd/prices`, { method: "GET", headers });
    if (res.ok) {
      const prices = await res.json();
      if (prices?.close?.available) method = "close";
      else if (prices?.overnight?.available) method = "overnight";
      else if (prices?.open?.available) method = "open";
      else {
        result.errors.push("Nenhum mercado MEP disponível");
        return result;
      }
    } else {
      result.errors.push(`FX prices: ${res.status}`);
      return result;
    }
  } catch (e) {
    result.errors.push(`FX prices: ${(e as Error).message.slice(0, 40)}`);
    return result;
  }

  result.method = method;
  const endpoint = method === "close" ? "/api/v4/orders/sell-close-mep"
    : method === "overnight" ? "/api/v4/orders/sell-overnight-mep"
    : "/api/v4/orders/sell-open-mep";

  // ── Step 3: Convert in chunks ──
  const MAX_PER_ORDER = 1000;
  let remaining = Math.floor(usdCash);
  
  while (remaining > 0) {
    const qty = Math.min(remaining, MAX_PER_ORDER);
    if (qty < 1) break;

    try {
      console.log(`[CONVERT] 🔄 ${account.email} → ${method} ${qty} USD`);
      const res = await pfetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quantity: qty }),
      });
      
      let data: any;
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      
      console.log(`[CONVERT] Response status=${res.status} body=${text.slice(0, 300)}`);
      
      if ((res.ok || res.status < 400) && (data?.Sucess || data?.Success || data?.Order || data?.order)) {
        result.orders.push(`${qty} USD via ${method}`);
        result.converted += qty;
        console.log(`[CONVERT] ✅ ${account.email} → ${qty} USD convertido`);
      } else {
        const errMsg = data?.message || data?.error || text.slice(0, 100);
        result.errors.push(`${qty} USD: ${errMsg}`);
        console.log(`[CONVERT] ❌ ${account.email} → ${qty} USD: ${errMsg}`);
        
        // If rejected or market issue, try smaller or stop
        if (errMsg.includes("REJECTED") && qty > 100) {
          remaining = Math.floor(remaining / 2);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        break;
      }
      
      remaining -= qty;
      if (remaining > 0) await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      result.errors.push(`${qty} USD: ${(e as Error).message.slice(0, 40)}`);
      break;
    }
  }

  // ── Step 4: Refresh balances ──
  if (result.converted > 0) {
    try {
      const [balArs, balUsd] = await Promise.all([
        pfetch(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        pfetch(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      const up: Record<string, unknown> = { last_data_sync_at: new Date().toISOString() };
      if (balArs) up.balance_ars = balArs;
      if (balUsd) up.balance_usd = balUsd;
      await supabase.from("cocos_accounts").update(up).eq("id", account.id);
    } catch { /* skip */ }
  }

  return result;
}

// ---------- Main ----------
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 2000;
const MAX_RUNTIME_MS = 140_000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let filterEmail: string | null = null;
    try {
      const body = await req.json();
      filterEmail = body?.email || null;
    } catch { /* no body */ }

    let query = supabase
      .from("cocos_accounts")
      .select("id, email, access_token, refresh_token, account_id, balance_usd, password, totp_secret")
      .not("refresh_token", "is", null)
      .neq("refresh_token", "");

    if (filterEmail) {
      query = query.eq("email", filterEmail);
    }

    const { data: accounts, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const withUsd = (accounts || []).filter((a: any) => {
      if (!a.refresh_token) return false;
      const cash = a.balance_usd?.cashBalance || 0;
      return filterEmail || cash >= 1;
    });

    console.log(`[CONVERT] 📊 ${withUsd.length} contas para converter USD→ARS`);

    const results: ConvertResult[] = [];
    let timedOut = false;

    for (let i = 0; i < withUsd.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        timedOut = true;
        break;
      }

      const batch = withUsd.slice(i, i + BATCH_SIZE);
      console.log(`[CONVERT] 📦 Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((a: any) => a.email).join(", ")}`);

      const batchResults = await Promise.all(
        batch.map((acct: any) => convertAccount(supabase, acct))
      );
      results.push(...batchResults);

      if (i + BATCH_SIZE < withUsd.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const totalConverted = results.reduce((s, r) => s + r.converted, 0);
    const totalErrors = results.filter(r => r.errors.length > 0).length;
    const activeResults = results.filter(r => r.converted > 0 || r.errors.length > 0);

    console.log(`[CONVERT] ✅ $${totalConverted} USD convertido | ${totalErrors} com erro`);

    return new Response(JSON.stringify({
      success: true,
      total_accounts: withUsd.length,
      processed: results.length,
      total_usd_converted: totalConverted,
      accounts_with_errors: totalErrors,
      timed_out: timedOut,
      results: activeResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[CONVERT] Error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
