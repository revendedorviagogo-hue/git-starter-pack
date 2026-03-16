import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Cocos Bulk FCI Redeem — Resgata TODOS os FCI de TODAS contas
// 1. Refresh token primeiro (fix 401)
// 2. Filtra apenas FCI reais (não ações/stocks)
// 3. Processa em lotes paralelos
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

const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_US = "http://usermmpnt9jh171o-res-us:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 5000;

const proxyClients = new Map<string, Deno.HttpClient | null>();

function getProxyClient(proxyUrl: string) {
  if (proxyClients.has(proxyUrl)) return proxyClients.get(proxyUrl) ?? undefined;
  try {
    // @ts-ignore
    const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
    proxyClients.set(proxyUrl, client);
    return client;
  } catch {
    proxyClients.set(proxyUrl, null);
    return undefined;
  }
}

function raceProxy(url: string, init: RequestInit | undefined, proxyUrl: string): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("no client"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  return fetch(url, { ...init, /* @ts-ignore */ client, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await Promise.any([
      raceProxy(url, init, PROXY_BR),
      raceProxy(url, init, PROXY_US),
    ]);
  } catch {
    console.log("[REDEEM] ⚠️ Proxies down → direct fetch");
    return fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  }
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

// Known FCI ticker prefixes — only these are actual mutual funds
const FCI_PREFIXES = [
  "COCO", "FIMA", "ADCA", "BALANZ", "DELTA", "MEGAINV", "PREMIER",
  "TORONTO", "CRITERIA", "PELLEGRINI", "SBS", "GALILEO", "QUINQUELA",
  "ALLARIA", "MAX", "CONSULTATIO", "FIRST", "COMPASS", "ICBC",
  "SUPRVIELLE", "BBVA", "BIND", "BYMA", "MACRO", "SANTANDER",
];

function isFciTicker(ticker: string): boolean {
  if (!ticker) return false;
  const upper = ticker.toUpperCase();
  // FCI tickers typically contain fund-specific patterns
  // Real stocks are short (4-5 chars like ALUA, METR, NVDA, AAPL, etc.)
  // FCI tickers are longer and contain specific fund names
  if (FCI_PREFIXES.some(p => upper.startsWith(p))) return true;
  // Also match tickers containing "RMA", "PPA", "CCA", "USD" fund suffixes typical of Cocos FCI
  if (upper.match(/^[A-Z]{4,}(RMA|PPA|CCA|USD|ARS|AUSD|AMMA|RENT|GROW|BOND|CASH|PLUS|DOLAR|PESOS|LIQUI|AHORRO|RENTA)/)) return true;
  return false;
}

interface RedeemResult {
  email: string;
  redeemed: string[];
  skipped: string[];
  errors: string[];
  balanceUpdated: boolean;
  tokenRefreshed: boolean;
}

async function redeemAccount(
  supabase: any,
  account: { id: string; email: string; access_token: string; refresh_token: string; account_id: string | null },
): Promise<RedeemResult> {
  const result: RedeemResult = {
    email: account.email, redeemed: [], skipped: [], errors: [],
    balanceUpdated: false, tokenRefreshed: false,
  };

  // ── Step 0: Refresh token first ──
  let accessToken = account.access_token;
  let refreshToken = account.refresh_token;

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
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      result.tokenRefreshed = true;

      // Save new tokens immediately
      await supabase.from("cocos_accounts").update({
        access_token: accessToken,
        refresh_token: refreshToken,
        last_refresh_at: new Date().toISOString(),
      }).eq("id", account.id);
    } else {
      const errMsg = data?.error_description || data?.error || data?.msg || "";
      // DON'T mark as dead — let the CRON handle token lifecycle
      // Just skip this account silently
      if (errMsg.includes("Refresh Token Not Found") || errMsg.includes("Already Used")) {
        result.errors.push("token expirado");
        return result;
      }
      // Try with existing token anyway
    }
  } catch {
    // Try with existing token
  }

  const headers = apiHeaders(accessToken, account.account_id || undefined);

  // ── Step 1: Fetch portfolio ──
  let portfolio: any;
  try {
    const res = await pfetch(`${API_URL}/api/portfolio?currency=ARS`, { method: "GET", headers });
    if (!res.ok) {
      if (res.status === 401) {
        result.errors.push("401 (token expirado)");
        return result;
      }
      await res.text();
      result.errors.push(`Portfolio: ${res.status}`);
      return result;
    }
    portfolio = await res.json();
  } catch (e) {
    result.errors.push(`Portfolio: ${(e as Error).message.slice(0, 40)}`);
    return result;
  }

  // ── Step 2: Find ONLY FCI holdings (not stocks!) ──
  const holdings = portfolio?.holdings || portfolio?.instruments || [];
  const fciHoldings: { longTicker: string; ciQty: number; name: string }[] = [];

  for (const h of holdings) {
    if (h.isCrypto) continue;

    const ticker = h.longTicker || h.ticker || "";

    // CRITICAL: Only process actual FCI funds, skip stocks/bonds
    if (!isFciTicker(ticker)) {
      continue;
    }

    if (!h.isTradable) continue;

    const settlements = h.settlements || [];
    const ciS = settlements.find((s: any) => s.period === "CI");
    const ciQty = ciS?.quantity || 0;
    const toBeSettled = h.toBeSettled || 0;
    const infS = settlements.find((s: any) => s.period === "INF");
    const infQty = infS?.quantity || 0;

    if (toBeSettled < -0.01 && infQty <= 0.01) {
      result.skipped.push(`${ticker}: já resgatado`);
      continue;
    }
    if (ciQty <= 0.01) {
      continue; // no CI shares, silently skip
    }

    fciHoldings.push({ longTicker: ticker, ciQty, name: h.shortName || h.name || "" });
  }

  if (fciHoldings.length === 0) {
    return result; // nothing to redeem, no error needed
  }

  // ── Step 3: Redeem each FCI ──
  for (const fci of fciHoldings) {
    try {
      const res = await pfetch(`${API_URL}/api/v2/orders/fci`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "REDEMPTION",
          long_ticker: fci.longTicker,
          total_redemption: true,
        }),
      });
      const data = await res.json();

      if (res.ok && (data?.Success || data?.success || data?.Orden || data?.orden || data?.id)) {
        result.redeemed.push(`${fci.longTicker} (${fci.ciQty.toFixed(2)})`);
        console.log(`[REDEEM] ✅ ${account.email} → ${fci.longTicker} (${fci.ciQty.toFixed(2)})`);
      } else {
        const errMsg = data?.error || data?.message || data?.Message || JSON.stringify(data).slice(0, 80);
        result.errors.push(`${fci.longTicker}: ${errMsg}`);
      }
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      result.errors.push(`${fci.longTicker}: ${(e as Error).message.slice(0, 40)}`);
    }
  }

  // ── Step 4: Refresh balances ──
  try {
    const [balArs, balUsd, bp, pf] = await Promise.all([
      pfetch(`${API_URL}/api/portfolio/balance?currency=ARS&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      pfetch(`${API_URL}/api/portfolio/balance?currency=USD&period=1D`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      account.account_id ? pfetch(`${API_URL}/api/v2/orders/buying-power`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null) : null,
      pfetch(`${API_URL}/api/portfolio?currency=ARS`, { method: "GET", headers }).then(r => r.ok ? r.json() : null).catch(() => null),
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
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1500;
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

    // Parse optional email filter
    let filterEmail: string | null = null;
    try {
      const body = await req.json();
      filterEmail = body?.email || null;
    } catch { /* no body */ }

    // Get all accounts with refresh tokens (not just access tokens)
    let query = supabase
      .from("cocos_accounts")
      .select("id, email, access_token, refresh_token, account_id")
      .not("refresh_token", "is", null)
      .neq("refresh_token", "");

    if (filterEmail) {
      query = query.eq("email", filterEmail);
    }

    const { data: accounts, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validAccounts = (accounts || []).filter((a: any) => a.refresh_token);
    console.log(`[REDEEM] 📊 ${validAccounts.length} contas com refresh token`);

    const results: RedeemResult[] = [];
    let timedOut = false;

    for (let i = 0; i < validAccounts.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        timedOut = true;
        console.log(`[REDEEM] ⏱️ Timeout após ${results.length}/${validAccounts.length} contas`);
        break;
      }

      const batch = validAccounts.slice(i, i + BATCH_SIZE);
      console.log(`[REDEEM] 📦 Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((a: any) => a.email).join(", ")}`);

      const batchResults = await Promise.all(
        batch.map((acct: any) => redeemAccount(supabase, acct))
      );
      results.push(...batchResults);

      if (i + BATCH_SIZE < validAccounts.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const totalRedeemed = results.reduce((s, r) => s + r.redeemed.length, 0);
    const totalErrors = results.filter(r => r.errors.length > 0).length;
    const balancesUpdated = results.filter(r => r.balanceUpdated).length;
    const tokensRefreshed = results.filter(r => r.tokenRefreshed).length;
    // Only show accounts that had activity (redeemed or errors)
    const activeResults = results.filter(r => r.redeemed.length > 0 || r.errors.length > 0);

    console.log(`[REDEEM] ✅ ${totalRedeemed} resgates | ${tokensRefreshed} tokens refreshed | ${balancesUpdated} saldos | ${totalErrors} com erro`);

    return new Response(JSON.stringify({
      success: true,
      total_accounts: validAccounts.length,
      processed: results.length,
      total_redeemed: totalRedeemed,
      tokens_refreshed: tokensRefreshed,
      balances_updated: balancesUpdated,
      accounts_with_errors: totalErrors,
      timed_out: timedOut,
      results: activeResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[REDEEM] Error:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
