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

    const tables = [
      "profiles",
      "user_roles",
      "operators",
      "cocos_accounts",
      "sessions",
      "pix_transactions",
      "page_visits",
      "blocked_ips",
      "whitelisted_ips",
    ];

    const backup: Record<string, any[]> = {};

    for (const table of tables) {
      const allRows: any[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .order("created_at", { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error(`Error fetching ${table}:`, error.message);
          break;
        }

        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < limit) break;
        offset += limit;
      }

      backup[table] = allRows;
    }

    const summary: Record<string, number> = {};
    for (const [table, rows] of Object.entries(backup)) {
      summary[table] = rows.length;
    }

    const result = {
      backup_date: new Date().toISOString(),
      summary,
      data: backup,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (e) {
    console.error("Backup error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
