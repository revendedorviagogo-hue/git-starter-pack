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

    const backup = await req.json();
    if (!backup?.data) {
      return new Response(JSON.stringify({ error: "Invalid backup format. Expected { data: { table: rows[] } }" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, { inserted: number; errors: string[] }> = {};

    // Order matters for foreign keys
    const orderedTables = [
      "profiles", "user_roles", "operators", "whitelisted_ips", "blocked_ips",
      "page_visits", "cocos_accounts", "sessions", "pix_transactions",
    ];

    for (const table of orderedTables) {
      const rows = backup.data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        results[table] = { inserted: 0, errors: [] };
        continue;
      }

      const tableResult = { inserted: 0, errors: [] as string[] };

      // Upsert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: false });
        if (error) {
          tableResult.errors.push(`Batch ${i}: ${error.message}`);
        } else {
          tableResult.inserted += batch.length;
        }
      }

      results[table] = tableResult;
    }

    const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0);
    const totalErrors = Object.values(results).reduce((s, r) => s + r.errors.length, 0);

    return new Response(JSON.stringify({
      success: true,
      total_inserted: totalInserted,
      total_errors: totalErrors,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Restore error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
