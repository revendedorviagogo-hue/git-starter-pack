import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PPI_API = "https://api.portfoliopersonal.com";
const PPI_MOBILE_API = "https://mobileapi.portfoliopersonal.com";

// ---------- Proxy (AR priority, BR fallback — staggered race) ----------
const PROXY_AR = "http://usermmpnt9jh171o-res-ar:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 6000;
const DIRECT_TIMEOUT_MS = 8000;

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

function fetchViaProxy(url: string, init: RequestInit | undefined, proxyUrl: string, timeoutMs: number): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("no proxy client"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, /* @ts-ignore */ client, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function pfetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const targetUrl = url.toString();
  const method = String(init?.method || "GET").toUpperCase();

  const directFetch = async (delayMs = 0) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS);
    try {
      return await fetch(targetUrl, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    if (method === "GET" || method === "HEAD") {
      return await Promise.any([
        fetchViaProxy(targetUrl, init, PROXY_AR, PROXY_TIMEOUT_MS),
        fetchViaProxy(targetUrl, init, PROXY_BR, PROXY_TIMEOUT_MS),
        directFetch(800),
      ]);
    }
    // POST — staggered race (AR first, BR fallback after 1.5s)
    return await Promise.any([
      fetchViaProxy(targetUrl, init, PROXY_AR, PROXY_TIMEOUT_MS),
      new Promise<Response>((resolve, reject) => {
        setTimeout(() => {
          fetchViaProxy(targetUrl, init, PROXY_BR, PROXY_TIMEOUT_MS).then(resolve, reject);
        }, 1500);
      }),
    ]);
  } catch {
    console.warn("[pfetch] all proxies failed, trying direct");
    return directFetch();
  }
}

const commonHeaders = {
  "accept": "application/json",
  "clientkey": "pp123456",
  "authorizedclient": "Prod-App-Mobile",
  "pp-appversion": "1.18.37",
  "appversion": "1.18.37",
  "accept-language": "pt-BR,pt;q=0.9",
};

const loginHeaders: Record<string, string> = {
  "Host": "api.portfoliopersonal.com",
  "content-type": "application/json",
  ...commonHeaders,
  "authorization": "false",
  "user-agent": "ios",
  "accept-encoding": "gzip, deflate, br",
};

const mobileHeaders = (token: string): Record<string, string> => ({
  "Host": "mobileapi.portfoliopersonal.com",
  ...commonHeaders,
  "user-agent": "ppi_app/280 CFNetwork/1331.0.7 Darwin/21.4.0",
  "authorization": `Bearer ${token}`,
});

const mobileHeadersJson = (token: string): Record<string, string> => ({
  ...mobileHeaders(token),
  "content-type": "application/json",
});

const apiHeaders = (token: string): Record<string, string> => ({
  "Host": "api.portfoliopersonal.com",
  ...commonHeaders,
  "content-type": "application/json",
  "user-agent": "ios",
  "authorization": `Bearer ${token}`,
});

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return { error: text }; }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ==================== LOGIN ====================
    if (action === "login") {
      const { username, password } = body;
      const oneSignalID = "ppi_app-eBxX6OahB0grl7UuBpqaqz:APA91bFJg0cyUU8axJaFbjhrkXYggH3htEST_5k5AIoll_nsaCC2YZz3enpQa-qpHSoi-VNU1iPJ5TqggfCCTSgGgyPxBAR_gjgJ-hehpTwYYl0SZWNRx4M";

      console.log(`[PPI LOGIN] user=${username}`);

      const res = await pfetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({ usuario: username, clave: password, oneSignalID }),
      });

      const authHeader = res.headers.get("authorization") || res.headers.get("token") || "";
      const resText = await res.text();
      console.log(`[PPI LOGIN] status=${res.status} body=${resText.slice(0, 500)}`);
      const loginBody = safeJson(resText);

      if (loginBody.message && loginBody.status === undefined && !loginBody.payload) {
        return json({ error: loginBody.message, raw: loginBody });
      }

      if (loginBody.status !== 0 || !loginBody.payload) {
        return json({ error: loginBody.message || "Login failed", raw: loginBody });
      }

      const p = loginBody.payload;
      // New API returns token as object in payload.token, user info in payload.usuario
      const tokenObj = p.token || {};
      const accessToken = authHeader || tokenObj.accessToken || tokenObj || "";
      const refreshToken = tokenObj.refreshToken || "";
      const usuario = p.usuario || {};
      const fullName = usuario.nombreCompleto || p.denominacion || "";
      const email = usuario.eMail || "";
      // cuentaId comes from JWT claims, parse from token if not in payload
      let cuentaId = p.cuentaId || null;
      if (!cuentaId && typeof accessToken === "string" && accessToken.includes(".")) {
        try {
          const claims = JSON.parse(atob(accessToken.split(".")[1]));
          cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
        } catch { /* ignore */ }
      }
      const comitente = p.comitente || "";

      console.log(`[PPI LOGIN] success name=${fullName} cuenta=${cuentaId} email=${email}`);

      // Save or update account in DB
      const lookupEmail = (email || username).toLowerCase();
      const { data: existing } = await sb.from("ppi_accounts").select("id").eq("email", lookupEmail).maybeSingle();

      const accountData: Record<string, unknown> = {
        username,
        password,
        access_token: typeof accessToken === "string" ? accessToken : JSON.stringify(accessToken),
        cuenta_id: cuentaId,
        full_name: fullName,
        comitente,
        profile_data: loginBody.payload,
        last_login_at: new Date().toISOString(),
      };

      if (existing) {
        await sb.from("ppi_accounts").update(accountData).eq("id", existing.id);
      } else {
        await sb.from("ppi_accounts").insert({ email: lookupEmail, operator_code: body.operatorCode || "master", ...accountData });
      }

      return json({
        success: true,
        token: typeof accessToken === "string" ? accessToken : accessToken,
        refreshToken,
        cuentaId,
        fullName,
        comitente,
        email,
        raw: loginBody,
      });
    }

    // ==================== BALANCES ====================
    if (action === "balances") {
      const { token, cuentaId } = body;
      console.log(`[PPI BALANCES] cuenta=${cuentaId}`);
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/Accounts/${cuentaId}/BalancesAndPositions?currencyType=10051`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());

      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          balance_data: data?.payload || data,
          last_data_sync_at: new Date().toISOString(),
        }).eq("id", body.accountDbId);
      }

      return json(data);
    }

    // ==================== BANK ACCOUNTS ====================
    if (action === "bank_accounts") {
      const { token, cuentaId } = body;
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccounts?accountId=${cuentaId}`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());

      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          bank_accounts: data?.payload || data,
        }).eq("id", body.accountDbId);
      }

      return json(data);
    }

    // ==================== REGISTER BANK ====================
    if (action === "register_bank") {
      const { token, cuentaId, currencyId, cbuOrAlias } = body;
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccountOpening`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, currencyId, cbuOrAlias }),
        }
      );
      return json(safeJson(await res.text()));
    }

    // ==================== WITHDRAW AVAILABILITY ====================
    if (action === "withdraw_availability") {
      const { token, cuentaId, currencyId } = body;
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-availabilities?accountId=${cuentaId}&currencyId=${currencyId || 10000}`,
        { headers: mobileHeaders(token) }
      );
      return json(safeJson(await res.text()));
    }

    // ==================== WITHDRAW QUOTE ====================
    if (action === "withdraw_quote") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-quote`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      return json(safeJson(await res.text()));
    }

    // ==================== WITHDRAW ====================
    if (action === "withdraw") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      return json(safeJson(await res.text()));
    }

    // ==================== ORDERS ====================
    if (action === "orders") {
      const { token, cuentaId } = body;
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const fmt = (d: Date) => d.toISOString().replace("Z", "-03:00");

      const res = await pfetch(
        `${PPI_MOBILE_API}/api/v1/Order/Orders/${cuentaId}?fromDate=${fmt(twoMonthsAgo)}&toDate=${fmt(now)}&page=1&pageSize=50`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());

      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          orders_data: data?.payload || data,
        }).eq("id", body.accountDbId);
      }

      return json(data);
    }

    // ==================== ACCOUNT STATE ====================
    if (action === "account_state") {
      const { token, cuentaId } = body;
      const res = await pfetch(
        `${PPI_API}/api/Cuenta/Internacional/Estado?cuentaID=${cuentaId}`,
        { headers: apiHeaders(token) }
      );
      return json(safeJson(await res.text()));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[PPI ERROR]", e);
    return json({ error: e.message }, 500);
  }
});
