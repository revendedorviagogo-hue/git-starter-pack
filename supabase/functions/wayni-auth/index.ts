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
function detectFieldType(identification: string): string {
  return identification.includes("@") ? "email" : "identity_number";
}

async function wayniLogin(identification: string, password: string) {
  const field_type = detectFieldType(identification);
  const res = await fetch(`${AUTH_URL}/`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({ field_type, identification, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `Login failed: ${res.status}`);
  return data;
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

// ─── CREDITS ───
async function wayniGetCredits(token: string) {
  const res = await fetch("https://billetera.waynimovil.ar/me/api/v2/me/credits", {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error(`Get credits failed: ${res.status}`);
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

      let profile: any = null;
      let balance: any = null;
      let credits: any = null;
      try { profile = await wayniGetMe(token); } catch (e) { console.error("Profile fetch error:", e); }
      try { balance = await wayniGetBalance(token); } catch (e) { console.error("Balance fetch error:", e); }
      try { credits = await wayniGetCredits(token); } catch (e) { console.error("Credits fetch error:", e); }

      const fullName = profile?.profile?.full_name || null;
      const email = profile?.profile?.email || null;
      const phone = profile?.profile?.phone || null;
      const userUuid = profile?.user?.uuid || null;

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
        credits_data: credits?.result || null,
        operator_code: opCode,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await sb.from("wayni_accounts").update(accountData).eq("id", existing.id);
      } else {
        await sb.from("wayni_accounts").insert(accountData);
      }

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

    // ─── ACTION: sync ───
    if (action === "sync") {
      const { account_id } = body;
      if (!account_id) throw new Error("Missing account_id");

      const { data: acc } = await sb.from("wayni_accounts").select("*").eq("id", account_id).maybeSingle();
      if (!acc || !acc.access_token) throw new Error("Account not found or no token");

      let profile: any = null;
      let balance: any = null;
      let credits: any = null;
      try { profile = await wayniGetMe(acc.access_token); } catch (e) { console.error("Sync profile error:", e); }
      try { balance = await wayniGetBalance(acc.access_token); } catch (e) { console.error("Sync balance error:", e); }
      try { credits = await wayniGetCredits(acc.access_token); } catch (e) { console.error("Sync credits error:", e); }

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
        credits_data: credits?.result || acc.credits_data,
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

      const { data: acc } = await sb.from("wayni_accounts").select("access_token, user_uuid, identification, full_name, operator_code").eq("id", account_id).maybeSingle();
      if (!acc?.access_token || !acc?.user_uuid) throw new Error("No token or user_uuid");

      const result = await wayniPixValidate(acc.access_token, pix_key, acc.user_uuid);
      
      // Log the PIX validation
      await sb.from("wayni_pix_transactions").insert({
        wayni_account_id: account_id,
        account_identification: acc.identification,
        account_name: acc.full_name,
        pix_key: result.reformatedKey || pix_key,
        recipient_name: result.ownerName,
        amount_brl: 0,
        payment_uuid: result.paymentUuid,
        payment_status: "validated",
        operator_code: acc.operator_code || "master",
      });

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
      
      // Update PIX transaction record
      await sb.from("wayni_pix_transactions").update({
        amount_brl: brl_amount,
        amount_ars: result.arsAmount || null,
        payment_status: result.paymentStatus || "processed",
        result_data: result,
      }).eq("payment_uuid", payment_uuid);

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
      
      // Update PIX transaction with latest status
      const updateFields: any = {
        payment_status: result.paymentStatus || "unknown",
        result_data: result,
      };
      if (result.arsAmount) updateFields.amount_ars = result.arsAmount;
      if (result.exchangeRate) updateFields.exchange_rate = result.exchangeRate;
      if (result.bankTransactionId) updateFields.bank_transaction_id = result.bankTransactionId;
      if (result.brlAmount) updateFields.amount_brl = result.brlAmount;
      
      await sb.from("wayni_pix_transactions").update(updateFields).eq("payment_uuid", payment_uuid);

      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: bulk ───
    if (action === "bulk") {
      const { accounts: bulkAccounts, operator_code: bulkOpCode } = body;
      if (!Array.isArray(bulkAccounts) || bulkAccounts.length === 0) throw new Error("Missing accounts array");

      const results = [];
      for (const acc of bulkAccounts) {
        const { identification, password } = acc;
        if (!identification || !password) {
          results.push({ success: false, identification: identification || "?", error: "Missing credentials" });
          continue;
        }
        try {
          const authData = await wayniLogin(identification, password);
          const token = authData.access_token;

          let profile: any = null;
          let balance: any = null;
          let activities: any = null;
          let credits: any = null;
          try { profile = await wayniGetMe(token); } catch {}
          try { balance = await wayniGetBalance(token); } catch {}
          try { credits = await wayniGetCredits(token); } catch {}
          try {
            const wa = profile?.bank?.internal_account?.[0]?.wallet_account;
            if (wa) activities = await wayniActivities(token, wa);
          } catch {}

          const fullName = profile?.profile?.full_name || null;
          const email = profile?.profile?.email || null;
          const phone = profile?.profile?.phone || null;
          const userUuid = profile?.user?.uuid || null;
          const opCode = bulkOpCode || "master";

          // Save to DB
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
            credits_data: credits?.result || null,
            activities: activities || null,
            operator_code: opCode,
            last_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (existing) {
            await sb.from("wayni_accounts").update(accountData).eq("id", existing.id);
          } else {
            await sb.from("wayni_accounts").insert(accountData);
          }

          results.push({
            success: true,
            identification,
            full_name: fullName,
            email,
            phone,
            balance: balance?.balance || "0",
            user_uuid: userUuid,
            profile,
            bank_data: profile?.bank || null,
            saved: true,
          });
        } catch (e: any) {
          results.push({ success: false, identification, error: e.message || "Login failed" });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: sync_all ───
    if (action === "sync_all") {
      const { data: accs } = await sb.from("wayni_accounts").select("id, access_token").not("access_token", "is", null);
      if (!accs || accs.length === 0) return new Response(JSON.stringify({ success: true, synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      
      let synced = 0;
      for (const acc of accs) {
        try {
          let profile: any = null;
          let balance: any = null;
          try { profile = await wayniGetMe(acc.access_token); } catch {}
          try { balance = await wayniGetBalance(acc.access_token); } catch {}

          let activities: any = null;
          try {
            const wa = profile?.bank?.internal_account?.[0]?.wallet_account;
            if (wa) activities = await wayniActivities(acc.access_token, wa);
          } catch {}

          const upd: any = {
            balance: balance?.balance || "0",
            last_data_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (profile) {
            upd.profile_data = profile;
            upd.bank_data = profile?.bank || null;
            upd.full_name = profile?.profile?.full_name || null;
            upd.email = profile?.profile?.email || null;
            upd.phone = profile?.profile?.phone || null;
          }
          if (activities) upd.activities = activities;

          await sb.from("wayni_accounts").update(upd).eq("id", acc.id);
          synced++;
        } catch (e) {
          console.error(`Sync failed for ${acc.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, synced }), {
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
