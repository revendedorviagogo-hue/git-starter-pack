import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PPI_API = "https://api.portfoliopersonal.com";
const PPI_MOBILE_API = "https://mobileapi.portfoliopersonal.com";

const commonHeaders = {
  "accept": "application/json",
  "clientkey": "pp123456",
  "authorizedclient": "Prod-App-Mobile",
  "pp-appversion": "1.18.37",
  "accept-language": "pt-BR,pt;q=0.9",
};

const loginHeaders = {
  ...commonHeaders,
  "content-type": "application/json",
  "user-agent": "ios",
  "authorization": "false",
};

const mobileHeaders = (token: string) => ({
  ...commonHeaders,
  "user-agent": "ppi_app/259 CFNetwork/1331.0.7 Darwin/21.4.0",
  "authorization": `Bearer ${token}`,
});

const mobileHeadersJson = (token: string) => ({
  ...mobileHeaders(token),
  "content-type": "application/json",
});

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return { error: text }; }
}

async function fetchPpi(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  return safeJson(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (action === "login") {
      const { username, password, accountId: existingAccountId } = body;
      const loginRes = await fetchPpi(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({
          usuario: username,
          clave: password,
          oneSignalID: `ppi_app-${crypto.randomUUID().slice(0, 8)}`,
        }),
      });

      if (loginRes.status !== 0 || !loginRes.payload) {
        return new Response(JSON.stringify({ error: loginRes.message || "Login failed", raw: loginRes }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }

      // Extract token from ticketId - PPI returns a JWT in the response header or we need to check
      // Actually PPI login returns the token differently. Let's check the response structure.
      // The token is typically in the response. Looking at the curl, authorization header uses Bearer token.
      // The login response has payload with cuentaId, ticketId etc but no token directly.
      // The token must come from a different field or header. Let me handle this.
      
      // For PPI, the login endpoint returns the JWT token. Based on the curl examples,
      // the token is a JWT. Let's assume it comes in a header or we need to make a second call.
      // Actually, looking more carefully at the response structure, the API likely returns the token
      // in a response header. Since we're using fetch, let's capture headers too.

      const loginRes2 = await fetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({
          usuario: username,
          clave: password,
          oneSignalID: `ppi_app-${crypto.randomUUID().slice(0, 8)}`,
        }),
      });
      
      const authHeader = loginRes2.headers.get("authorization") || loginRes2.headers.get("token") || "";
      const loginBody = safeJson(await loginRes2.text());
      
      // The token might be in loginBody.payload.token or similar
      const token = authHeader || loginBody?.payload?.token || loginBody?.token || "";
      
      if (!token && loginBody.status === 0) {
        // Token might be embedded in a different field, return full response for debugging
        return new Response(JSON.stringify({ 
          success: true, 
          payload: loginBody.payload,
          message: "Login OK but no token found. Check response.",
          allHeaders: Object.fromEntries(loginRes2.headers.entries()),
          raw: loginBody,
        }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }

      const p = loginBody.payload || {};
      const cuentaId = p.cuentaId;
      const fullName = p.denominacion;
      const comitente = p.comitente;

      // Save or update account in DB
      const { data: existing } = await sb.from("ppi_accounts").select("id").eq("email", username.toLowerCase()).maybeSingle();
      
      const accountData: Record<string, unknown> = {
        username,
        password,
        access_token: token || null,
        cuenta_id: cuentaId,
        full_name: fullName,
        comitente,
        profile_data: loginBody.payload,
        last_login_at: new Date().toISOString(),
      };

      if (existing) {
        await sb.from("ppi_accounts").update(accountData).eq("id", existing.id);
      } else {
        await sb.from("ppi_accounts").insert({ email: username.toLowerCase(), operator_code: body.operatorCode || "master", ...accountData });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        token, 
        cuentaId, 
        fullName, 
        comitente,
        raw: loginBody,
        headers: Object.fromEntries(loginRes2.headers.entries()),
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "balances") {
      const { token, cuentaId } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/Accounts/${cuentaId}/BalancesAndPositions?currencyType=10051`,
        { headers: mobileHeaders(token) }
      );
      
      // Save to DB
      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          balance_data: data?.payload || data,
          last_data_sync_at: new Date().toISOString(),
        }).eq("id", body.accountDbId);
      }
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "bank_accounts") {
      const { token, cuentaId } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccounts?accountId=${cuentaId}`,
        { headers: mobileHeaders(token) }
      );
      
      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          bank_accounts: data?.payload || data,
        }).eq("id", body.accountDbId);
      }
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "register_bank") {
      const { token, cuentaId, currencyId, cbuOrAlias } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccountOpening`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, currencyId, cbuOrAlias }),
        }
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw_availability") {
      const { token, cuentaId, currencyId } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-availabilities?accountId=${cuentaId}&currencyId=${currencyId || 10000}`,
        { headers: mobileHeaders(token) }
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw_quote") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-quote`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "orders") {
      const { token, cuentaId } = body;
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const fmt = (d: Date) => d.toISOString().replace("Z", "-03:00");
      
      const data = await fetchPpi(
        `${PPI_MOBILE_API}/api/v1/Order/Orders/${cuentaId}?fromDate=${fmt(twoMonthsAgo)}&toDate=${fmt(now)}&page=1&pageSize=50`,
        { headers: mobileHeaders(token) }
      );
      
      if (body.accountDbId) {
        await sb.from("ppi_accounts").update({
          orders_data: data?.payload || data,
        }).eq("id", body.accountDbId);
      }
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "account_state") {
      const { token, cuentaId } = body;
      const data = await fetchPpi(
        `${PPI_API}/api/Cuenta/Internacional/Estado?cuentaID=${cuentaId}`,
        { headers: { ...commonHeaders, "content-type": "application/json", "user-agent": "ios", "authorization": `Bearer ${token}` } }
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
