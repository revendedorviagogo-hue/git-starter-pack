import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Cocos Token Refresh + Balance Sync CRON
// Processes accounts in PARALLEL BATCHES for maximum speed
// Ensures no token goes stale (>10min without refresh)
// ============================================================

const AUTH_URL = "https://auth.cocos.capital";
const API_URL = "https://api.cocos.capital";

const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzI0NzA5NjAwLAogICJleHAiOiAxODgyNDc2MDAwCn0.GieFvIDlSbRw6-KvFX8xPEzqzhXgIQ0Hc-ELKvrVirs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Process 5 accounts simultaneously per batch, 1.5s between batches
const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 1500;
const MAX_ACCOUNTS_PER_RUN = 200;

// ---------- Proxy (rainproxy residential AR) ----------
const PROXY_POOL = [
  "http://usermmpnt9jh171o-res-ar:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959",
];

let proxyIndex = Math.floor(Math.random() * PROXY_POOL.length);

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

async function pfetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = url.toString();
  for (let attempt = 0; attempt < PROXY_POOL.length; attempt++) {
    const proxy = nextProxy();
    try {
      const res = await fetch(targetUrl, { ...init, /* @ts-ignore */ client: createProxyClient(proxy) });
      return res;
    } catch (e) {
      console.warn(`[CRON-PROXY] ${proxy.split("@")[1]} failed (${attempt + 1}): ${(e as Error).message}`);
    }
  }
  return fetch(targetUrl, init);
}

// ---------- API helpers ----------
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

async function fetchJson(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await pfetch(url, { method: "GET", headers });
    if (!res.ok) return { ok: false, data: null };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, data: null };
  }
}

// ---------- Refresh + sync single account ----------
async function refreshAndSync(
  supabase: any,
  account: { id: string; email: string; refresh_token: string; account_id: string | null },
  index: number,
  total: number
): Promise<{ email: string; success: boolean; balanceSynced: boolean; error?: string }> {
  console.log(`[CRON] 🔄 (${index + 1}/${total}) ${account.email}`);

  // Step 1: Refresh token
  let newAccessToken = "";
  let newRefreshToken = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await pfetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "accept": "*/*",
          "content-type": "application/json;charset=UTF-8",
          apikey: COCOS_ANON_KEY,
          "User-Agent": "okhttp/4.12.0",
          "Accept-Encoding": "gzip",
          "Connection": "Keep-Alive",
        },
        body: JSON.stringify({ refresh_token: account.refresh_token }),
      });
      const data = await res.json();

      if (res.ok && data.access_token && data.refresh_token) {
        newAccessToken = data.access_token;
        newRefreshToken = data.refresh_token;
        break;
      }

      const errMsg = data?.error_description || data?.error || data?.msg || "unknown";

      if (errMsg.includes("solicitudes") || errMsg.includes("rate") || errMsg.includes("Too many")) {
        console.log(`[CRON] 🛑 ${account.email} RATE LIMITED`);
        await supabase.from("cocos_accounts").update({ last_refresh_at: new Date().toISOString() }).eq("id", account.id);
        return { email: account.email, success: false, balanceSynced: false, error: `RATE_LIMIT: ${errMsg}` };
      }

      if (errMsg.includes("Already Used")) {
        console.log(`[CRON] ⏭️ ${account.email} token already used`);
        return { email: account.email, success: false, balanceSynced: false, error: "already_used" };
      }

      if (errMsg.includes("Refresh Token Not Found")) {
        await supabase.from("cocos_accounts").update({ info_tag: `⚠️ Token morto: ${errMsg}`, last_refresh_at: new Date().toISOString() }).eq("id", account.id);
        return { email: account.email, success: false, balanceSynced: false, error: errMsg };
      }

      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }

      await supabase.from("cocos_accounts").update({ last_refresh_at: new Date().toISOString() }).eq("id", account.id);
      return { email: account.email, success: false, balanceSynced: false, error: errMsg };
    } catch (e) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
      return { email: account.email, success: false, balanceSynced: false, error: (e as Error).message };
    }
  }

  if (!newAccessToken) {
    return { email: account.email, success: false, balanceSynced: false, error: "no token after retries" };
  }

  // Step 2: Get account_id if missing
  let accountId = account.account_id || "";
  if (!accountId) {
    const { ok, data } = await fetchJson(`${API_URL}/api/v2/users/me`, apiHeaders(newAccessToken));
    if (ok && data?.id_accounts?.[0]) {
      accountId = String(data.id_accounts[0]);
      console.log(`[CRON] 📋 ${account.email} account_id=${accountId}`);
    }
  }

  // Step 3: Fetch balances (ARS + USD) and buying power in parallel
  const headers = apiHeaders(newAccessToken, accountId || undefined);
  const [balArs, balUsd, buyingPower, portfolio] = await Promise.all([
    fetchJson(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, headers),
    fetchJson(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, headers),
    accountId ? fetchJson(`${API_URL}/api/v2/orders/buying-power`, headers) : Promise.resolve({ ok: false, data: null }),
    fetchJson(`${API_URL}/api/portfolio?currency=ARS`, headers),
  ]);

  const balanceSynced = balArs.ok || balUsd.ok;

  // Step 4: Save everything to DB
  const updatePayload: Record<string, unknown> = {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    last_refresh_at: new Date().toISOString(),
    info_tag: null,
  };

  if (accountId) updatePayload.account_id = accountId;
  if (balArs.ok && balArs.data) updatePayload.balance_ars = balArs.data;
  if (balUsd.ok && balUsd.data) updatePayload.balance_usd = balUsd.data;
  if (buyingPower.ok && buyingPower.data) updatePayload.buying_power = buyingPower.data;
  if (portfolio.ok && portfolio.data) updatePayload.portfolio_data = portfolio.data;
  if (balanceSynced) updatePayload.last_data_sync_at = new Date().toISOString();

  await supabase.from("cocos_accounts").update(updatePayload).eq("id", account.id);

  const arsTotal = balArs.data?.balance != null ? `ARS ${Number(balArs.data.balance).toFixed(0)}` : "—";
  const usdTotal = balUsd.data?.balance != null ? `USD ${Number(balUsd.data.balance).toFixed(2)}` : "—";
  console.log(`[CRON] ✅ (${index + 1}/${total}) ${account.email} | ${arsTotal} | ${usdTotal}`);

  return { email: account.email, success: true, balanceSynced };
}

// ---------- Main handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL accounts with valid refresh tokens, prioritizing oldest refresh
    const { data: accounts, error } = await supabase
      .from("cocos_accounts")
      .select("id, email, refresh_token, last_refresh_at, info_tag, account_id")
      .not("refresh_token", "is", null)
      .neq("refresh_token", "")
      .order("last_refresh_at", { ascending: true, nullsFirst: true })
      .limit(MAX_ACCOUNTS_PER_RUN);

    if (error) {
      console.error("[CRON] Error fetching accounts:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validAccounts = accounts || [];
    console.log(`[CRON] 📊 ${validAccounts.length} accounts to refresh + sync balances`);

    if (validAccounts.length === 0) {
      return new Response(JSON.stringify({ success: true, refreshed: 0, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { email: string; success: boolean; balanceSynced: boolean; error?: string }[] = [];
    let rateLimited = false;

    // Process in parallel batches of BATCH_SIZE
    for (let batchStart = 0; batchStart < validAccounts.length; batchStart += BATCH_SIZE) {
      if (rateLimited) break;

      const batch = validAccounts.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`[CRON] 📦 Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batch.map(a => a.email).join(", ")}`);

      const batchResults = await Promise.all(
        batch.map((account, idx) =>
          refreshAndSync(supabase, account, batchStart + idx, validAccounts.length)
        )
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.error?.startsWith("RATE_LIMIT")) {
          rateLimited = true;
        }
      }

      // Small delay between batches to avoid hammering
      if (batchStart + BATCH_SIZE < validAccounts.length && !rateLimited) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const balanceSyncCount = results.filter(r => r.balanceSynced).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[CRON] ✅ Done: ${successCount} refreshed, ${balanceSyncCount} balances synced, ${failCount} failed${rateLimited ? " (RATE LIMITED)" : ""}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: validAccounts.length,
        processed: results.length,
        refreshed: successCount,
        balances_synced: balanceSyncCount,
        failed: failCount,
        rate_limited: rateLimited,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[CRON] Unhandled error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
