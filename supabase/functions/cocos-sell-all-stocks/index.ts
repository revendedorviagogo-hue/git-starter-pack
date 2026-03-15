// v2 - fixed: fallback to existing access_token when refresh fails
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Cocos Sell All Stocks — Vende TODOS os investimentos (ações,
// CEDEARs, ONs, etc.) de TODAS as contas via ordem MARKET SELL CI
// ============================================================

const AUTH_URL = "https://auth.cocos.capital";
const API_URL = "https://api.cocos.capital";

// MUST match the key used in cocos-auth (audience: "cocos") — otherwise refresh_token fails
const COCOS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJhdWRpZW5jZSI6ICJjb2NvcyIsCiAgICAiaXNzIjogInN1cGFiYXNlIiwKICAgICJpYXQiOiAxNjQxOTU2NDAwLAogICAgImV4cCI6IDM5NDgzNDE1MzEKfQ.Q5ZiL7KCUKP7iSM_LHWd3gffZ0k5Ce6CemOX9CUfEdM";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (accountId) {
    h["x-account-id"] = accountId;
    h["Cookie"] = `cocos-access-token=${accessToken}`;
  }
  return h;
}

// FCI prefixes to EXCLUDE (we only want stocks/bonds)
const FCI_PREFIXES = [
  "COCO", "FIMA", "ADCA", "BALANZ", "DELTA", "MEGAINV", "PREMIER",
  "TORONTO", "CRITERIA", "PELLEGRINI", "SBS", "GALILEO", "QUINQUELA",
  "ALLARIA", "MAX", "CONSULTATIO", "FIRST", "COMPASS", "ICBC",
  "SUPRVIELLE", "BBVA", "BIND", "BYMA", "MACRO", "SANTANDER",
];

function isFciTicker(ticker: string): boolean {
  if (!ticker) return false;
  const upper = ticker.toUpperCase();
  if (FCI_PREFIXES.some(p => upper.startsWith(p))) return true;
  if (upper.match(/^[A-Z]{4,}(RMA|PPA|CCA|USD|ARS|AUSD|AMMA|RENT|GROW|BOND|CASH|PLUS|DOLAR|PESOS|LIQUI|AHORRO|RENTA)/)) return true;
  return false;
}

interface SellResult {
  email: string;
  sold: string[];
  skipped: string[];
  errors: string[];
  tokenRefreshed: boolean;
  balanceUpdated: boolean;
}

async function sellAccountStocks(
  supabase: any,
  account: { id: string; email: string; access_token: string; refresh_token: string; account_id: string | null },
): Promise<SellResult> {
  const result: SellResult = {
    email: account.email, sold: [], skipped: [], errors: [],
    tokenRefreshed: false, balanceUpdated: false,
  };

  // ── Step 0: Try refresh token, but fallback to existing access_token ──
  let accessToken = account.access_token;

  try {
    const res = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
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
      accessToken = data.access_token;
      result.tokenRefreshed = true;

      await supabase.from("cocos_accounts").update({
        access_token: accessToken,
        refresh_token: data.refresh_token,
        last_refresh_at: new Date().toISOString(),
      }).eq("id", account.id);
    } else {
      console.log(`[SELL] ⚠️ ${account.email}: refresh failed, trying existing access_token`);
    }
  } catch {
    console.log(`[SELL] ⚠️ ${account.email}: refresh exception, trying existing access_token`);
  }

  const headers = apiHeaders(accessToken, account.account_id || undefined);

  // ── Step 1: Fetch portfolio ──
  let portfolio: any;
  try {
    console.log(`[SELL] 🔍 ${account.email}: fetching portfolio with token ${accessToken.slice(-10)}...`);
    const res = await fetch(`${API_URL}/api/portfolio?currency=ARS`, { method: "GET", headers });
    console.log(`[SELL] 🔍 ${account.email}: portfolio status=${res.status}`);
    if (!res.ok) {
      const bodyText = await res.text();
      console.log(`[SELL] ❌ ${account.email}: portfolio error body: ${bodyText.slice(0, 200)}`);
      if (res.status === 401) {
        result.errors.push("401 (token expirado)");
        return result;
      }
      result.errors.push(`Portfolio: ${res.status}`);
      return result;
    }
    portfolio = await res.json();
    const holdingsCount = (portfolio?.holdings || portfolio?.instruments || []).length;
    console.log(`[SELL] 🔍 ${account.email}: portfolio holdings=${holdingsCount}, keys=${Object.keys(portfolio || {}).join(",")}`);
  } catch (e) {
    console.log(`[SELL] ❌ ${account.email}: portfolio exception: ${(e as Error).message}`);
    result.errors.push(`Portfolio: ${(e as Error).message.slice(0, 40)}`);
    return result;
  }

  // ── Step 2: Find stock/bond holdings (NOT FCI, NOT crypto) ──
  const holdings = portfolio?.holdings || portfolio?.instruments || [];
  const stockHoldings: { longTicker: string; ciQty: number; name: string }[] = [];

  for (const h of holdings) {
    if (h.isCrypto) continue;

    const ticker = h.longTicker || h.ticker || "";

    // SKIP FCI — we only want stocks/bonds/CEDEARs
    if (isFciTicker(ticker)) {
      continue;
    }

    if (!h.isTradable) {
      result.skipped.push(`${ticker}: não tradável`);
      continue;
    }

    const settlements = h.settlements || [];
    const ciS = settlements.find((s: any) => s.period === "CI");
    const ciQty = ciS?.quantity || 0;

    if (ciQty <= 0) {
      // Check if there's any quantity at all
      const totalQty = h.quantity || 0;
      if (totalQty > 0) {
        result.skipped.push(`${ticker}: qty=${totalQty} mas sem CI disponível`);
      }
      continue;
    }

    // Quantity must be integer for stocks
    const sellQty = Math.floor(ciQty);
    if (sellQty <= 0) {
      result.skipped.push(`${ticker}: qty CI < 1 (${ciQty})`);
      continue;
    }

    stockHoldings.push({ longTicker: ticker, ciQty: sellQty, name: h.shortName || h.name || "" });
  }

  if (stockHoldings.length === 0) {
    return result;
  }

  console.log(`[SELL] 📊 ${account.email}: ${stockHoldings.length} ativos para vender`);

  // ── Step 3: Sell each stock via MARKET order ──
  for (const stock of stockHoldings) {
    try {
      const orderBody = {
        type: "MARKET",
        side: "SELL",
        quantity: stock.ciQty,
        long_ticker: stock.longTicker,
      };

      console.log(`[SELL] 🔄 ${account.email} → ${stock.longTicker} x${stock.ciQty}`);

      const res = await fetch(`${API_URL}/api/v2/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(orderBody),
      });
      const data = await res.json();

      if (res.ok && (data?.id || data?.order_id || data?.Success || data?.success)) {
        result.sold.push(`${stock.longTicker} x${stock.ciQty}`);
        console.log(`[SELL] ✅ ${account.email} → ${stock.longTicker} x${stock.ciQty} VENDIDO`);
      } else {
        const errMsg = data?.error || data?.message || data?.Message || JSON.stringify(data).slice(0, 100);
        result.errors.push(`${stock.longTicker}: ${errMsg}`);
        console.log(`[SELL] ❌ ${account.email} → ${stock.longTicker}: ${errMsg}`);
      }

      // Small delay between orders
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      result.errors.push(`${stock.longTicker}: ${(e as Error).message.slice(0, 40)}`);
    }
  }

  // ── Step 4: Refresh balances ──
  try {
    const [balArs, balUsd, bp, pf] = await Promise.all([
      fetch(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      account.account_id ? fetch(`${API_URL}/api/v2/orders/buying-power`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null) : null,
      fetch(`${API_URL}/api/portfolio?currency=ARS`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const up: Record<string, unknown> = { last_data_sync_at: new Date().toISOString() };
    if (balArs) up.balance_ars = balArs;
    if (balUsd) up.balance_usd = balUsd;
    if (bp) up.buying_power = bp;
    if (pf) up.portfolio_data = pf;
    await supabase.from("cocos_accounts").update(up).eq("id", account.id);
    result.balanceUpdated = true;
  } catch { /* skip */ }

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

    // Parse optional filters from body
    let filterEmail: string | null = null;
    let filterOperator: string | null = null;
    try {
      const body = await req.json();
      filterEmail = body?.email || null;
      filterOperator = body?.operator_code || null;
    } catch { /* no body */ }

    // Build query
    let query = supabase
      .from("cocos_accounts")
      .select("id, email, access_token, refresh_token, account_id")
      .not("refresh_token", "is", null)
      .neq("refresh_token", "");

    if (filterEmail) {
      query = query.eq("email", filterEmail);
    }
    if (filterOperator) {
      query = query.eq("operator_code", filterOperator);
    }

    const { data: accounts, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validAccounts = (accounts || []).filter((a: any) => a.refresh_token);
    console.log(`[SELL] 📊 ${validAccounts.length} contas para processar`);

    const results: SellResult[] = [];
    let timedOut = false;

    for (let i = 0; i < validAccounts.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        timedOut = true;
        break;
      }

      const batch = validAccounts.slice(i, i + BATCH_SIZE);
      console.log(`[SELL] 📦 Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((a: any) => a.email).join(", ")}`);

      const batchResults = await Promise.all(
        batch.map((acct: any) => sellAccountStocks(supabase, acct))
      );
      results.push(...batchResults);

      if (i + BATCH_SIZE < validAccounts.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const totalSold = results.reduce((s, r) => s + r.sold.length, 0);
    const totalErrors = results.filter(r => r.errors.length > 0).length;
    const activeResults = results.filter(r => r.sold.length > 0 || r.errors.length > 0);

    console.log(`[SELL] ✅ ${totalSold} vendas | ${totalErrors} com erro`);

    return new Response(JSON.stringify({
      success: true,
      total_accounts: validAccounts.length,
      processed: results.length,
      total_sold: totalSold,
      accounts_with_errors: totalErrors,
      timed_out: timedOut,
      results: activeResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[SELL] Error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
