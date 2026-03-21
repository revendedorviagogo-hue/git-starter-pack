import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PPI_API = "https://api.portfoliopersonal.com";
const PPI_WEB = "https://cuenta.portfoliopersonal.com";
const PPI_MOBILE_API = "https://mobileapi.portfoliopersonal.com";
const DEFAULT_ONE_SIGNAL_ID = "ppi_app-eBxX6OahB0grl7UuBpqaqz:APA91bFJg0cyUU8axJaFbjhrkXYggH3htEST_5k5AIoll_nsaCC2YZz3enpQa-qpHSoi-VNU1iPJ5TqggfCCTSgGgyPxBAR_gjgJ-hehpTwYYl0SZWNRx4M";
const DEFAULT_FP = "TFE8NkpRaWNfYWRkX2FmZmNbUTNDUWlRdDU4NlFbUUBEUWlRKDo_NUBIRFFO";

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
  "accept-language": "pt-BR,pt;q=0.9",
};

const mobileCommon = {
  ...commonHeaders,
  "authorizedclient": "Prod-App-Mobile",
  "pp-appversion": "1.18.37",
  "appversion": "1.18.37",
};

const loginHeaders: Record<string, string> = {
  "Host": "api.portfoliopersonal.com",
  "content-type": "application/json",
  ...mobileCommon,
  "authorization": "false",
  "user-agent": "ios",
  "accept-encoding": "gzip, deflate, br",
};

const webLoginHeaders = (fp: string): Record<string, string> => ({
  "Host": "api.portfoliopersonal.com",
  "content-type": "application/json",
  "accept": "*/*",
  "clientkey": "pp123456",
  "authorizedclient": "191206",
  "fp": fp,
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
  "origin": "https://cuenta.portfoliopersonal.com",
  "referer": "https://cuenta.portfoliopersonal.com/",
  "sec-fetch-site": "same-site",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "accept-language": "pt-BR,pt;q=0.9",
});

// web2fa headers removed — using mobile API for 2FA now

const mobileHeaders = (token: string): Record<string, string> => ({
  "Host": "mobileapi.portfoliopersonal.com",
  ...mobileCommon,
  "user-agent": "ppi_app/280 CFNetwork/1331.0.7 Darwin/21.4.0",
  "authorization": `Bearer ${token}`,
});

const mobileHeadersJson = (token: string): Record<string, string> => ({
  ...mobileHeaders(token),
  "content-type": "application/json",
});

const apiHeaders = (token: string): Record<string, string> => ({
  "Host": "api.portfoliopersonal.com",
  ...mobileCommon,
  "content-type": "application/json",
  "user-agent": "ios",
  "authorization": `Bearer ${token}`,
});

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return { error: text }; }
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveDeviceContext(body: Record<string, unknown>, profileData: Record<string, unknown>) {
  const oneSignalID =
    parseOptionalString(body.oneSignalId) ??
    parseOptionalString(body.oneSignalID) ??
    parseOptionalString(profileData.oneSignalID) ??
    DEFAULT_ONE_SIGNAL_ID;

  const fp =
    parseOptionalString(body.fp) ??
    parseOptionalString(profileData.fp) ??
    DEFAULT_FP;

  const dispositivoID =
    parseOptionalNumber(body.dispositivoId) ??
    parseOptionalNumber(body.dispositivo_id) ??
    parseOptionalNumber(body.dispositivoID) ??
    parseOptionalNumber(profileData.dispositivoID);

  return { oneSignalID, fp, dispositivoID };
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

      console.log(`[PPI LOGIN] user=${username}`);

      const { data: existingByUsername } = await sb
        .from("ppi_accounts")
        .select("id, profile_data")
        .eq("username", username)
        .maybeSingle();

      const existingProfileData = asRecord(existingByUsername?.profile_data);
      const { oneSignalID, fp, dispositivoID } = resolveDeviceContext(body, existingProfileData);
      const loginPayload: Record<string, unknown> = { usuario: username, clave: password, oneSignalID };
      if (dispositivoID !== undefined) {
        loginPayload.dispositivoID = dispositivoID;
        loginPayload.DispositivoID = dispositivoID;
      }

      const res = await pfetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: { ...loginHeaders, fp },
        body: JSON.stringify(loginPayload),
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
      const resolvedDispositivoID = parseOptionalNumber(p.dispositivoID) ?? dispositivoID;
      const comitente = p.comitente || "";

      console.log(`[PPI LOGIN] success name=${fullName} cuenta=${cuentaId} email=${email}`);

      // Save or update account in DB
      const lookupEmail = (email || username).toLowerCase();
      const { data: existing } = await sb
        .from("ppi_accounts")
        .select("id, profile_data")
        .eq("email", lookupEmail)
        .maybeSingle();

      const mergedProfileData = {
        ...asRecord(existing?.profile_data),
        ...asRecord(loginBody.payload),
        oneSignalID,
        fp,
        ...(resolvedDispositivoID !== undefined ? { dispositivoID: resolvedDispositivoID } : {}),
      };

      const accountData: Record<string, unknown> = {
        username,
        password,
        access_token: typeof accessToken === "string" ? accessToken : JSON.stringify(accessToken),
        cuenta_id: cuentaId,
        full_name: fullName,
        comitente,
        profile_data: mergedProfileData,
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

    // ==================== LOGIN WEB (2FA flow) ====================
    if (action === "login_web") {
      const { username, password } = body;

      console.log(`[PPI LOGIN WEB] user=${username}`);

      const { data: existingByUsername } = await sb
        .from("ppi_accounts")
        .select("id, profile_data")
        .eq("username", username)
        .maybeSingle();

      const existingProfileData = asRecord(existingByUsername?.profile_data);
      const { oneSignalID, fp, dispositivoID } = resolveDeviceContext(body, existingProfileData);
      const loginPayload: Record<string, unknown> = { usuario: username, clave: password, oneSignalID };
      if (dispositivoID !== undefined) {
        loginPayload.dispositivoID = dispositivoID;
        loginPayload.DispositivoID = dispositivoID;
      }

      const res = await pfetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: { ...loginHeaders, fp },
        body: JSON.stringify(loginPayload),
      });

      const resText = await res.text();
      console.log(`[PPI LOGIN WEB] status=${res.status} body=${resText.slice(0, 500)}`);
      const loginBody = safeJson(resText);

      if (loginBody.status !== 0 || !loginBody.payload) {
        return json({ error: loginBody.message || "Login failed", raw: loginBody });
      }

      const p = loginBody.payload;
      const usuario = p.usuario || {};
      const fullName = usuario.nombreCompleto || "";
      const emailAddr = usuario.eMail || "";

      // Save credentials early
      const lookupEmail = (emailAddr || username).toLowerCase();
      const { data: existing } = await sb.from("ppi_accounts").select("id").eq("email", lookupEmail).maybeSingle();
      const resolvedDispositivoID = parseOptionalNumber(p.dispositivoID) ?? dispositivoID;
      const mergedProfileData = {
        ...existingProfileData,
        ...asRecord(p),
        oneSignalID,
        fp,
        ...(resolvedDispositivoID !== undefined ? { dispositivoID: resolvedDispositivoID } : {}),
      };

      const accountBase: Record<string, unknown> = {
        username,
        password,
        full_name: fullName,
        profile_data: mergedProfileData,
        last_login_at: new Date().toISOString(),
      };
      if (existing) {
        await sb.from("ppi_accounts").update(accountBase).eq("id", existing.id);
      } else {
        await sb.from("ppi_accounts").insert({ email: lookupEmail, operator_code: body.operatorCode || "master", ...accountBase });
      }

      // Check if 2FA is required
      if (p.twoFAInfo && p.twoFAInfo.token) {
        console.log(`[PPI LOGIN WEB] 2FA required type=${p.twoFAInfo.twoFactorType} dispositivoID=${p.dispositivoID}`);
        return json({
          success: false,
          requires_2fa: true,
          twofa_token: p.twoFAInfo.token,
          twofa_type: p.twoFAInfo.twoFactorType,
          dispositivo_id: resolvedDispositivoID,
          one_signal_id: oneSignalID,
          fp,
          fullName,
          email: emailAddr,
          message: p.mensaje || "Se solicita doble factor para acceder.",
          raw: loginBody,
        });
      }

      // No 2FA — direct token
      const tokenObj = p.token || {};
      const accessToken = tokenObj.accessToken || "";
      const refreshToken = tokenObj.refreshToken || "";
      let cuentaId: number | null = null;
      if (accessToken && accessToken.includes(".")) {
        try {
          const claims = JSON.parse(atob(accessToken.split(".")[1]));
          cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
        } catch { /* */ }
      }

      await sb.from("ppi_accounts").update({
        access_token: accessToken,
        cuenta_id: cuentaId,
        info_tag: `web_login_ok ${new Date().toISOString().slice(11, 19)}`,
        profile_data: {
          ...mergedProfileData,
          ...asRecord(p),
          oneSignalID,
          fp,
        },
      }).eq("email", lookupEmail);

      return json({
        success: true,
        token: accessToken,
        refreshToken,
        cuentaId,
        fullName,
        email: emailAddr,
        raw: loginBody,
      });
    }

    // ==================== VALIDATE 2FA (mobile API) ====================
    if (action === "validate_2fa") {
      const { code, username, userId, twofaType, twofaToken } = body;

      let existingProfileData: Record<string, unknown> = {};
      const normalizedUser = parseOptionalString(username);
      if (normalizedUser) {
        const { data: byUsername } = await sb
          .from("ppi_accounts")
          .select("id, profile_data")
          .eq("username", normalizedUser)
          .maybeSingle();

        if (byUsername) {
          existingProfileData = asRecord(byUsername.profile_data);
        } else {
          const { data: byEmail } = await sb
            .from("ppi_accounts")
            .select("id, profile_data")
            .eq("email", normalizedUser.toLowerCase())
            .maybeSingle();
          existingProfileData = asRecord(byEmail?.profile_data);
        }
      }

      const { oneSignalID, fp, dispositivoID } = resolveDeviceContext(body, existingProfileData);
      const resolvedTwofaToken = parseOptionalString(twofaToken) ?? parseOptionalString(body.twofa_token) ?? parseOptionalString(existingProfileData.twofa_token);

      const resolvedUserId = Number(userId);
      const parsedTwofaType = Number(twofaType);
      const resolvedTwofaType = Number.isFinite(parsedTwofaType) ? parsedTwofaType : 1;

      if (!Number.isFinite(resolvedUserId)) {
        return json({ error: "Missing or invalid userId for 2FA validation", raw: { userId } }, 400);
      }

      console.log(`[PPI 2FA] code=${code} userId=${resolvedUserId} type=${resolvedTwofaType} device=${dispositivoID ?? "none"}`);

      const validatePayload: Record<string, unknown> = {
        UserId: resolvedUserId,
        Codigo: code,
        Recordar: true,
        TwoFactType: resolvedTwofaType,
        esBiometrico: false,
        oneSignalID,
      };

      if (dispositivoID !== undefined) {
        validatePayload.DispositivoID = dispositivoID;
        validatePayload.dispositivoID = dispositivoID;
      }

      if (resolvedTwofaToken) {
        validatePayload.Token = resolvedTwofaToken;
        validatePayload.token = resolvedTwofaToken;
      }

      const res = await pfetch(`${PPI_API}/api/Seguridad/Auth/ValidateUser2FA`, {
        method: "POST",
        headers: { ...loginHeaders, fp },
        body: JSON.stringify(validatePayload),
      });

      const resText = await res.text();
      console.log(`[PPI 2FA] status=${res.status} body=${resText.slice(0, 500)}`);
      const tfaBody = safeJson(resText);

      if (tfaBody.status !== 0 || !tfaBody.payload) {
        return json({ error: tfaBody.message || "2FA validation failed", raw: tfaBody });
      }

      const p = tfaBody.payload;
      const usuario = p.usuario || {};
      const fullName = usuario.nombreCompleto || "";
      const emailAddr = usuario.eMail || "";
      const tokenObj = p.token || {};
      const accessToken = tokenObj.accessToken || "";
      const refreshToken = tokenObj.refreshToken || "";

      let cuentaId: number | null = null;
      if (accessToken && accessToken.includes(".")) {
        try {
          const claims = JSON.parse(atob(accessToken.split(".")[1]));
          cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
        } catch { /* */ }
      }
      const resolvedDispositivoID = parseOptionalNumber(p.dispositivoID) ?? dispositivoID;

      console.log(`[PPI 2FA] success name=${fullName} cuenta=${cuentaId} email=${emailAddr}`);

      // Update account
      const lookupEmail = (emailAddr || username || "").toLowerCase();
      if (lookupEmail) {
        const { data: existing } = await sb
          .from("ppi_accounts")
          .select("id, profile_data")
          .eq("email", lookupEmail)
          .maybeSingle();

        await sb.from("ppi_accounts").update({
          access_token: accessToken,
          cuenta_id: cuentaId,
          full_name: fullName,
          profile_data: {
            ...asRecord(existing?.profile_data),
            ...existingProfileData,
            ...asRecord(p),
            oneSignalID,
            fp,
            ...(resolvedDispositivoID !== undefined ? { dispositivoID: resolvedDispositivoID } : {}),
          },
          info_tag: `2fa_ok ${new Date().toISOString().slice(11, 19)}`,
          last_login_at: new Date().toISOString(),
        }).eq("email", lookupEmail);
      }

      return json({
        success: true,
        token: accessToken,
        refreshToken,
        cuentaId,
        dispositivo_id: resolvedDispositivoID,
        fullName,
        email: emailAddr,
        raw: tfaBody,
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

    // ==================== REFRESH (relogin + sync) ====================
    if (action === "refresh") {
      const { accountId } = body;
      console.log(`[PPI REFRESH] accountId=${accountId}`);

      const { data: acc } = await sb.from("ppi_accounts").select("*").eq("id", accountId).maybeSingle();
      if (!acc || !acc.username || !acc.password) {
        return json({ error: "Account not found or missing credentials" }, 404);
      }

      const MAX_RETRIES = 3;
      let lastError = "";

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[PPI REFRESH] attempt ${attempt} for ${acc.email}`);
          const profileData = asRecord(acc.profile_data);
          const { oneSignalID, fp, dispositivoID } = resolveDeviceContext({}, profileData);
          const loginPayload: Record<string, unknown> = {
            usuario: acc.username,
            clave: acc.password,
            oneSignalID,
          };
          if (dispositivoID !== undefined) {
            loginPayload.dispositivoID = dispositivoID;
            loginPayload.DispositivoID = dispositivoID;
          }

          const loginRes = await pfetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
            method: "POST",
            headers: { ...loginHeaders, fp },
            body: JSON.stringify(loginPayload),
          });

          const loginText = await loginRes.text();
          const loginData = safeJson(loginText);

          if (loginData.status !== 0 || !loginData.payload) {
            lastError = loginData.message || "Login failed";
            await sb.from("ppi_accounts").update({ info_tag: `refresh_err: ${lastError}` }).eq("id", accountId);
            if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
            return json({ error: lastError, attempt });
          }

          const p = loginData.payload;
          const tokenObj = p.token || {};
          const newToken = tokenObj.accessToken || tokenObj || "";
          const resolvedDispositivoID = parseOptionalNumber(p.dispositivoID) ?? dispositivoID;
          let cuentaId = p.cuentaId || acc.cuenta_id;
          if (!cuentaId && typeof newToken === "string" && newToken.includes(".")) {
            try {
              const claims = JSON.parse(atob(newToken.split(".")[1]));
              cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
            } catch { /* */ }
          }
          const fullName = p.usuario?.nombreCompleto || p.denominacion || acc.full_name;

          // Update token
          await sb.from("ppi_accounts").update({
            access_token: typeof newToken === "string" ? newToken : JSON.stringify(newToken),
            cuenta_id: cuentaId,
            full_name: fullName,
            profile_data: {
              ...profileData,
              ...asRecord(p),
              oneSignalID,
              fp,
              ...(resolvedDispositivoID !== undefined ? { dispositivoID: resolvedDispositivoID } : {}),
            },
            last_login_at: new Date().toISOString(),
            info_tag: `refresh_ok ${new Date().toISOString().slice(11, 19)}`,
          }).eq("id", accountId);

          // Sync balances
          if (cuentaId && newToken) {
            try {
              const balRes = await pfetch(
                `${PPI_MOBILE_API}/api/v1/Accounts/${cuentaId}/BalancesAndPositions?currencyType=10051`,
                { headers: mobileHeaders(typeof newToken === "string" ? newToken : String(newToken)) }
              );
              const balData = safeJson(await balRes.text());
              await sb.from("ppi_accounts").update({
                balance_data: balData?.payload || balData,
                last_data_sync_at: new Date().toISOString(),
              }).eq("id", accountId);
            } catch (e) {
              console.warn(`[PPI REFRESH] balance sync failed for ${acc.email}:`, e.message);
            }

            // Sync bank accounts
            try {
              const bankRes = await pfetch(
                `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccounts?accountId=${cuentaId}`,
                { headers: mobileHeaders(typeof newToken === "string" ? newToken : String(newToken)) }
              );
              const bankData = safeJson(await bankRes.text());
              await sb.from("ppi_accounts").update({
                bank_accounts: bankData?.payload || bankData,
              }).eq("id", accountId);
            } catch (e) {
              console.warn(`[PPI REFRESH] bank sync failed for ${acc.email}:`, e.message);
            }
          }

          console.log(`[PPI REFRESH] success for ${acc.email} attempt=${attempt}`);
          return json({ success: true, email: acc.email, attempt });
        } catch (e) {
          lastError = e.message;
          console.warn(`[PPI REFRESH] attempt ${attempt} error:`, lastError);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      }

      await sb.from("ppi_accounts").update({ info_tag: `refresh_failed: ${lastError}` }).eq("id", accountId);
      return json({ error: lastError, exhausted: true });
    }

    // ==================== REFRESH ALL (cron) ====================
    if (action === "refresh_all") {
      console.log(`[PPI REFRESH ALL] starting`);
      const { data: allAccounts } = await sb
        .from("ppi_accounts")
        .select("id, email, username, password, profile_data")
        .not("username", "is", null)
        .not("password", "is", null);
      if (!allAccounts || allAccounts.length === 0) return json({ success: true, processed: 0 });

      const results: { email: string; ok: boolean; error?: string }[] = [];
      const startTime = Date.now();
      const GUARD_MS = 140000; // 140s guard

      for (let i = 0; i < allAccounts.length; i++) {
        if (Date.now() - startTime > GUARD_MS) {
          console.warn(`[PPI REFRESH ALL] time guard hit at ${i}/${allAccounts.length}`);
          break;
        }
        const acc = allAccounts[i];
        // Staggered delay between accounts (3-8s random)
        if (i > 0) await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));

        try {
          const profileData = asRecord(acc.profile_data);
          const { oneSignalID, fp, dispositivoID } = resolveDeviceContext({}, profileData);
          const loginPayload: Record<string, unknown> = {
            usuario: acc.username,
            clave: acc.password,
            oneSignalID,
          };
          if (dispositivoID !== undefined) {
            loginPayload.dispositivoID = dispositivoID;
            loginPayload.DispositivoID = dispositivoID;
          }

          const loginRes = await pfetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
            method: "POST",
            headers: { ...loginHeaders, fp },
            body: JSON.stringify(loginPayload),
          });
          const loginData = safeJson(await loginRes.text());

          if (loginData.status !== 0 || !loginData.payload) {
            await sb.from("ppi_accounts").update({ info_tag: `cron_err: ${loginData.message || "fail"}` }).eq("id", acc.id);
            results.push({ email: acc.email, ok: false, error: loginData.message });
            continue;
          }

          const p = loginData.payload;
          const tokenObj = p.token || {};
          const newToken = tokenObj.accessToken || tokenObj || "";
          const resolvedDispositivoID = parseOptionalNumber(p.dispositivoID) ?? dispositivoID;
          let cuentaId = p.cuentaId || null;
          if (!cuentaId && typeof newToken === "string" && newToken.includes(".")) {
            try {
              const claims = JSON.parse(atob(newToken.split(".")[1]));
              cuentaId = parseInt(claims["PPAuth.Claims.General.Cuentas"]) || null;
            } catch { /* */ }
          }

          const updateData: Record<string, unknown> = {
            access_token: typeof newToken === "string" ? newToken : JSON.stringify(newToken),
            cuenta_id: cuentaId,
            full_name: p.usuario?.nombreCompleto || p.denominacion || "",
            profile_data: {
              ...profileData,
              ...asRecord(p),
              oneSignalID,
              fp,
              ...(resolvedDispositivoID !== undefined ? { dispositivoID: resolvedDispositivoID } : {}),
            },
            last_login_at: new Date().toISOString(),
            info_tag: `cron_ok ${new Date().toISOString().slice(11, 19)}`,
          };

          // Sync balances
          if (cuentaId && newToken) {
            try {
              const tok = typeof newToken === "string" ? newToken : String(newToken);
              const balRes = await pfetch(
                `${PPI_MOBILE_API}/api/v1/Accounts/${cuentaId}/BalancesAndPositions?currencyType=10051`,
                { headers: mobileHeaders(tok) }
              );
              const balData = safeJson(await balRes.text());
              updateData.balance_data = balData?.payload || balData;
              updateData.last_data_sync_at = new Date().toISOString();
            } catch { /* */ }
          }

          await sb.from("ppi_accounts").update(updateData).eq("id", acc.id);
          results.push({ email: acc.email, ok: true });
        } catch (e) {
          await sb.from("ppi_accounts").update({ info_tag: `cron_err: ${e.message}` }).eq("id", acc.id);
          results.push({ email: acc.email, ok: false, error: e.message });
        }
      }

      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      console.log(`[PPI REFRESH ALL] done ok=${ok} fail=${fail}`);
      return json({ success: true, processed: results.length, ok, fail, results });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[PPI ERROR]", e);
    return json({ error: e.message }, 500);
  }
});
