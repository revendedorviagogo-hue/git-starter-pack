import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get all cocos_accounts with missing password
    const { data: accounts, error: accErr } = await supabase
      .from("cocos_accounts")
      .select("id, email, password")
      .or("password.is.null,password.eq.");

    if (accErr) throw accErr;

    const missing = (accounts || []).filter((a: any) => !a.password);
    console.log(`[FILL-PWD] Found ${missing.length} accounts without password`);

    if (missing.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: "All accounts already have passwords" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const results: { email: string; found: boolean }[] = [];

    for (const acct of missing) {
      // Find most recent session with password for this email
      const { data: sessions } = await supabase
        .from("sessions")
        .select("password")
        .eq("email", acct.email)
        .not("password", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      const pwd = sessions?.[0]?.password;
      if (pwd) {
        await supabase
          .from("cocos_accounts")
          .update({ password: pwd })
          .eq("id", acct.id);
        updated++;
        results.push({ email: acct.email, found: true });
      } else {
        results.push({ email: acct.email, found: false });
      }
    }

    console.log(`[FILL-PWD] Updated ${updated}/${missing.length} accounts`);

    return new Response(JSON.stringify({
      success: true,
      total_missing: missing.length,
      updated,
      not_found: missing.length - updated,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[FILL-PWD] Error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
