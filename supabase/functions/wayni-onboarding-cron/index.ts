import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// Wayni Onboarding Auto-Processor CRON
// Polls pending onboarding accounts, checks biometric + wallet,
// auto-triggers account creation when biometric is complete
// ============================================================

const PROXY_BR = "http://usermmpnt9jh171o-res-br:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_US = "http://usermmpnt9jh171o-res-us:Pwd3Z4HIoCHzyP47auRU4Y0@gw.proxy.rainproxy.io:5959";
const PROXY_TIMEOUT_MS = 5000;
const DIRECT_TIMEOUT_MS = 8000;

const proxyClients = new Map<string, Deno.HttpClient | null>();

function getProxyClient(proxyUrl: string) {
  if (proxyClients.has(proxyUrl)) return proxyClients.get(proxyUrl) ?? undefined;
  try {
    const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
    proxyClients.set(proxyUrl, client);
    return client;
  } catch {
    proxyClients.set(proxyUrl, null);
    return undefined;
  }
}

function fetchViaProxy(url: string, init: RequestInit, proxyUrl: string): Promise<Response> {
  const client = getProxyClient(proxyUrl);
  if (!client) return Promise.reject(new Error("no client"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  return fetch(url, { ...init, client, signal: controller.signal } as any)
    .finally(() => clearTimeout(timer));
}

async function pfetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await Promise.any([
      fetchViaProxy(url, init!, PROXY_BR),
      fetchViaProxy(url, init!, PROXY_US),
    ]);
  } catch {
    return fetch(url, { ...init, signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS) });
  }
}

async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
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

// ── API calls (same as wayni-auth edge function) ──

async function getBiometricInfo(dni: string): Promise<any> {
  try {
    const res = await pfetch(`${AUTH_URL}/biometric-info?identityNumber=${encodeURIComponent(dni)}`, {
      method: "GET",
      headers: COMMON_HEADERS,
    });
    if (!res.ok) return null;
    const data = await safeJson(res);
    if (!data) return null;
    return {
      success: true,
      status: data.status,
      has_selfie: !!data.selfie,
      has_dni_front: !!data.dniFront,
      has_dni_back: !!data.dniBack,
      last_completed_section: data.lastCompletedSection,
      facematching: data.facematching || null,
    };
  } catch {
    return null;
  }
}

async function getWalletStatus(dni: string): Promise<any> {
  try {
    const res = await pfetch(`${WALLET_URL}/wallet/check/${encodeURIComponent(dni)}`, {
      method: "GET",
      headers: {
        ...COMMON_HEADERS,
        "x-ms-auth-key": "3FA5B781-6FAE-4B6B-BE62-841542B0BBA5",
      },
    });
    if (!res.ok) return null;
    return await safeJson(res);
  } catch {
    return null;
  }
}

async function invokeWayniAuth(supabaseUrl: string, serviceKey: string, body: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/wayni-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  }
}

// ── Main processor ──

interface OnboardingRow {
  id: string;
  email: string;
  dni: string | null;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  user_uuid: string | null;
  password: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  zip_code: string | null;
  biometric_url: string | null;
  biometric_id: string | null;
  wallet_status: string | null;
  bio_status: string | null;
  status: string;
  operator_code: string;
  metadata: Record<string, any> | null;
  session_id: string | null;
  face_code: string | null;
  face_confidence: string | null;
}

async function processAccount(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  row: OnboardingRow,
  index: number,
  total: number,
): Promise<{ email: string; action: string; success: boolean; wallet_became_active?: boolean; error?: string }> {
  const label = `[WAYNI-CRON] (${index + 1}/${total}) ${row.email}`;

  if (!row.dni) {
    console.log(`${label} ⏭ sem DNI`);
    return { email: row.email, action: "skip", success: true };
  }

  // Step 1: Check biometric + wallet status
  const [bio, wallet] = await Promise.all([
    getBiometricInfo(row.dni),
    getWalletStatus(row.dni),
  ]);

  const walletStatus = wallet?.status ? String(wallet.status).toUpperCase() : null;
  const bioComplete = bio?.success && bio?.has_selfie === true && bio?.has_dni_front === true && bio?.has_dni_back === true;
  const walletActive = walletStatus === "ACTIVE";

  // Update DB with latest status
  const updatePayload: Record<string, unknown> = {};
  if (walletStatus) updatePayload.wallet_status = walletStatus;
  if (bio?.success) {
    updatePayload.bio_status = bio.status || "unknown";
    if (bio.facematching) {
      updatePayload.face_code = String(bio.facematching.code || "");
      updatePayload.face_confidence = String(bio.facematching.confidence || "");
    }
  }

  if (walletActive && bioComplete) {
    updatePayload.status = "validated";
    console.log(`${label} ✅ WALLET ACTIVE + BIO COMPLETE → validated`);
    await supabase.from("wayni_onboarding").update(updatePayload).eq("id", row.id);
    return { email: row.email, action: "validated", success: true, wallet_became_active: row.wallet_status !== "ACTIVE" };
  }

  // If biometric is complete but wallet NOT active → auto-trigger account creation
  if (bioComplete && !walletActive && row.user_uuid) {
    console.log(`${label} 🔄 Bio completa, wallet pendente → auto-criando conta...`);

    // Try the full chain: onboarding_verify → save_address → onboarding_biometric
    const steps: string[] = [];
    let resolvedUuid = row.user_uuid;

    // Step: save-data (verify)
    try {
      const verifyRes = await invokeWayniAuth(supabaseUrl, serviceKey, {
        action: "onboarding_verify",
        email: row.email,
        identity_number: row.dni,
        phone_number: row.phone || "",
        password: row.password || "",
        selected_full_name: row.full_name || undefined,
        selected_gender: row.gender || undefined,
        selected_tax_identification_value: row.metadata?.tax_identification_value || undefined,
      });
      if (verifyRes?.user_uuid) resolvedUuid = verifyRes.user_uuid;
      steps.push("✓ verify");
    } catch (e: any) {
      if (resolvedUuid) {
        steps.push("⚠ verify (existing)");
      } else {
        console.log(`${label} ❌ verify failed: ${e?.message}`);
        await supabase.from("wayni_onboarding").update(updatePayload).eq("id", row.id);
        return { email: row.email, action: "auto_create_failed", success: false, error: `verify: ${e?.message}` };
      }
    }

    // Step: save-address
    const hasAddress = row.street && row.city && row.region && row.zip_code;
    if (hasAddress) {
      try {
        await invokeWayniAuth(supabaseUrl, serviceKey, {
          action: "save_address",
          uuid: resolvedUuid,
          street_name: row.street,
          street_number: row.metadata?.street_number || "0",
          floor: null,
          apartment: null,
          zip_code: row.zip_code,
          neighborhood: null,
          city_id: parseInt(row.metadata?.city_id || "0") || 0,
          city: row.city,
          region_id: parseInt(row.metadata?.region_id || "0") || 0,
          region: row.region,
        });
        steps.push("✓ address");
      } catch {
        steps.push("⚠ address");
      }
    }

    // Step: biometric
    try {
      const bioRes = await invokeWayniAuth(supabaseUrl, serviceKey, {
        action: "onboarding_biometric",
        identity_number: row.dni,
        user_uuid: resolvedUuid,
        gender: row.gender || "X",
      });
      if (bioRes?.biometric_url || bioRes?.url) {
        const bioUrl = bioRes.biometric_url || bioRes.url;
        updatePayload.biometric_url = bioUrl;
        if (bioRes.externalIdentifier) updatePayload.biometric_id = bioRes.externalIdentifier;
        steps.push("✓ biometric");
      } else {
        steps.push("⚠ biometric (no url)");
      }
    } catch (e: any) {
      steps.push(`✗ biometric: ${e?.message?.slice(0, 60)}`);
    }

    updatePayload.user_uuid = resolvedUuid;
    await supabase.from("wayni_onboarding").update(updatePayload).eq("id", row.id);

    console.log(`${label} Auto-create chain: ${steps.join(" → ")}`);
    return { email: row.email, action: "auto_create", success: true };
  }

  // Just update status
  if (Object.keys(updatePayload).length > 0) {
    await supabase.from("wayni_onboarding").update(updatePayload).eq("id", row.id);
  }

  console.log(`${label} 📊 bio=${bio?.status || "?"} wallet=${walletStatus || "?"}`);
  return { email: row.email, action: "checked", success: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all non-validated onboarding records with DNI
    const { data: rows, error } = await supabase
      .from("wayni_onboarding")
      .select("*")
      .not("dni", "is", null)
      .neq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accounts = (rows || []) as OnboardingRow[];
    console.log(`[WAYNI-CRON] 🔍 Found ${accounts.length} pending onboarding accounts`);

    if (accounts.length === 0) {
      return new Response(JSON.stringify({ success: true, total: 0, message: "No pending accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 120_000;
    const DELAY_MS = 2000; // 2s between each account

    for (let i = 0; i < accounts.length; i++) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.warn(`[WAYNI-CRON] ⏱️ Runtime guard at ${i}/${accounts.length}`);
        break;
      }

      const result = await processAccount(supabase, supabaseUrl, serviceKey, accounts[i], i, accounts.length);
      results.push(result);

      if (i < accounts.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    const validated = results.filter(r => r.action === "validated").length;
    const autoCreated = results.filter(r => r.action === "auto_create").length;
    const walletBecameActive = results.filter(r => r.wallet_became_active).length;

    console.log(`[WAYNI-CRON] ✅ Done: ${validated} validated, ${autoCreated} auto-created, ${walletBecameActive} new wallets`);

    return new Response(JSON.stringify({
      success: true,
      total: accounts.length,
      processed: results.length,
      validated,
      auto_created: autoCreated,
      new_wallets: walletBecameActive,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[WAYNI-CRON] Unhandled:", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
