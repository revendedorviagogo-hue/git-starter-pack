import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const API_URL = "https://api.cocos.capital";
const CHUNK_SIZE = 50000; // ARS per chunk
const DELAY_MS = 2000; // 2s between chunks

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Proxy (rainproxy ISP rotating) ----------
const PROXY_URL = "http://x7gp3cl1hp-package-isp:rlbg07vmxj@isp-us.rainproxy.io:30";
let proxyClient: Deno.HttpClient | undefined;
let proxyEnabled = true;

function getProxyClient() {
  if (proxyClient) return proxyClient;
  try {
    // @ts-ignore
    proxyClient = Deno.createHttpClient({ proxy: { url: PROXY_URL } });
    return proxyClient;
  } catch {
    return undefined;
  }
}

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  if (!proxyEnabled) return fetch(url, init);
  const client = getProxyClient();
  if (!client) return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, /* @ts-ignore */ client, signal: controller.signal });
    return res;
  } catch (e) {
    console.warn(`[BULK-PROXY] failed: ${(e as Error).message}, falling back to direct`);
    proxyEnabled = false;
    return fetch(url, init);
  } finally {
    clearTimeout(timer);
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { access_token, account_id, total_ars, base_ticker } = await req.json();
    if (!access_token || !account_id || !total_ars) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ticker = base_ticker || "SOL";
    const totalArs = Number(total_ars);
    const numChunks = Math.ceil(totalArs / CHUNK_SIZE);
    
    const results: Array<{ chunk: number; sol: number; ars: number; status: string; error?: string }> = [];
    let totalSol = 0;
    let totalArsSpent = 0;

    for (let i = 0; i < numChunks; i++) {
      const remaining = totalArs - totalArsSpent;
      const chunkAmount = Math.min(CHUNK_SIZE, remaining);
      if (chunkAmount < 100) break; // too small

      try {
        // Step 1: Create buy order
        const buyRes = await pfetch(`${API_URL}/api/v1/crypto/customer/orders/buy`, {
          method: "POST",
          headers: apiHeaders(access_token, account_id),
          body: JSON.stringify({ baseTicker: ticker, quoteTicker: "ARS", quoteQuantity: chunkAmount }),
        });
        const buyData = await buyRes.json();

        if (!buyData.idOrder) {
          results.push({ chunk: i + 1, sol: 0, ars: chunkAmount, status: "buy_failed", error: JSON.stringify(buyData).slice(0, 200) });
          // If we get a 403/banned, stop immediately
          if (buyRes.status === 403 || JSON.stringify(buyData).includes("BANNED")) break;
          continue;
        }

        // Step 2: Confirm
        const confirmRes = await pfetch(`${API_URL}/api/v1/crypto/customer/orders/buy/confirm`, {
          method: "POST",
          headers: apiHeaders(access_token, account_id),
          body: JSON.stringify({ idOrder: buyData.idOrder }),
        });
        const confirmData = await confirmRes.json();

        if (confirmData.status === "completed") {
          const sol = buyData.baseQuantity || 0;
          const ars = buyData.quoteQuantity || chunkAmount;
          totalSol += sol;
          totalArsSpent += ars;
          results.push({ chunk: i + 1, sol, ars, status: "completed" });
        } else {
          results.push({ chunk: i + 1, sol: 0, ars: chunkAmount, status: "confirm_failed", error: JSON.stringify(confirmData).slice(0, 200) });
        }
      } catch (e) {
        results.push({ chunk: i + 1, sol: 0, ars: chunkAmount, status: "error", error: (e as Error).message });
      }

      // Delay between chunks (except last)
      if (i < numChunks - 1) await sleep(DELAY_MS);
    }

    return new Response(JSON.stringify({
      success: true,
      total_sol: totalSol,
      total_ars_spent: totalArsSpent,
      chunks_completed: results.filter(r => r.status === "completed").length,
      chunks_total: numChunks,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
