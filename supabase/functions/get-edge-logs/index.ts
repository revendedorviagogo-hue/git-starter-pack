import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Get cron job execution logs from pg_cron
    const { data: cronData } = await supabase.rpc("get_cron_logs", { max_rows: 30 });

    // 2. Get recent cocos_accounts refresh activity
    const { data: recentCocos } = await supabase
      .from("cocos_accounts")
      .select("email, last_refresh_at, last_login_at, access_token, info_tag, last_data_sync_at")
      .not("last_refresh_at", "is", null)
      .order("last_refresh_at", { ascending: false })
      .limit(30);

    // 3. Get recent wayni onboarding activity  
    const { data: recentWayni } = await supabase
      .from("wayni_onboarding")
      .select("email, status, wallet_status, bio_status, face_code, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    // 4. Get stats
    const [
      { count: cocosTotal },
      { count: cocosWithToken },
      { count: cocosNoToken },
      { count: wayniPending },
      { count: wayniValidated },
    ] = await Promise.all([
      supabase.from("cocos_accounts").select("*", { count: "exact", head: true }),
      supabase.from("cocos_accounts").select("*", { count: "exact", head: true }).not("access_token", "is", null),
      supabase.from("cocos_accounts").select("*", { count: "exact", head: true }).is("access_token", null),
      supabase.from("wayni_onboarding").select("*", { count: "exact", head: true }).neq("status", "validated"),
      supabase.from("wayni_onboarding").select("*", { count: "exact", head: true }).eq("status", "validated"),
    ]);

    // 5. Build detailed log entries from actual data
    const entries: { time: string; source: string; level: string; message: string }[] = [];

    // Process cocos refresh data
    if (recentCocos) {
      for (const acc of recentCocos) {
        const hasToken = !!acc.access_token;
        const tag = acc.info_tag || "";
        entries.push({
          time: acc.last_refresh_at || acc.last_login_at || new Date().toISOString(),
          source: "COCOS-CRON",
          level: hasToken ? "success" : "error",
          message: hasToken
            ? `✅ ${acc.email} token refreshed ${tag ? `[${tag}]` : ""}`
            : `❌ ${acc.email} sem token ${tag ? `[${tag}]` : ""}`,
        });
      }
    }

    // Process wayni onboarding data
    if (recentWayni) {
      for (const row of recentWayni) {
        const isValid = row.status === "validated";
        const walletOk = row.wallet_status === "ACTIVE";
        entries.push({
          time: row.updated_at || row.created_at,
          source: "WAYNI-CRON",
          level: isValid ? "success" : walletOk ? "info" : "warn",
          message: isValid
            ? `✅ ${row.email} validado (wallet: ${row.wallet_status}, bio: ${row.bio_status})`
            : `🔄 ${row.email} status=${row.status} wallet=${row.wallet_status || "?"} bio=${row.bio_status || "?"} face=${row.face_code || "?"}`,
        });
      }
    }

    // Sort by time desc
    entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return new Response(JSON.stringify({
      success: true,
      entries: entries.slice(0, limit),
      cron_jobs: cronData || [],
      stats: {
        cocos_total: cocosTotal || 0,
        cocos_with_token: cocosWithToken || 0,
        cocos_no_token: cocosNoToken || 0,
        wayni_pending: wayniPending || 0,
        wayni_validated: wayniValidated || 0,
      },
      fetched_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
