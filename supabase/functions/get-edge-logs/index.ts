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
    const since = url.searchParams.get("since") || "";
    const search = url.searchParams.get("search") || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

    // Query analytics endpoint for function_logs
    let query = `select id, timestamp, event_message, metadata from function_logs where event_message not like '%shutdown%' and event_message not like '%booted%' and event_message not like '%Listening on%'`;
    
    if (since) {
      query += ` and cast(timestamp as int8) >= ${parseInt(since)}`;
    }
    if (search) {
      query += ` and event_message like '%${search.replace(/'/g, "''")}%'`;
    }
    
    query += ` order by timestamp desc limit ${Math.min(limit, 200)}`;

    // Use the Supabase analytics endpoint
    const analyticsUrl = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all/query`;
    const res = await fetch(analyticsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ sql: query, iso_timestamp_fields: ["timestamp"] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ success: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData = await res.json();
    
    // Parse the analytics response into clean log entries
    const logs: { id: string; timestamp: number; message: string; function_id: string; level: string }[] = [];
    
    if (Array.isArray(rawData)) {
      for (const row of rawData) {
        const msg = row.event_message || "";
        const ts = row.timestamp || 0;
        const meta = row.metadata?.[0] || row.metadata || {};
        const funcId = meta.function_id || "";
        const level = meta.level || "info";
        
        logs.push({
          id: row.id || `${ts}-${Math.random()}`,
          timestamp: typeof ts === "number" ? ts : parseFloat(ts) || 0,
          message: msg.trim(),
          function_id: funcId,
          level,
        });
      }
    }

    // Also get cron job details from DB
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: cronData } = await supabase.rpc("get_cron_logs", { max_rows: 20 });

    return new Response(JSON.stringify({ 
      success: true, 
      logs,
      cron_jobs: cronData || [],
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
