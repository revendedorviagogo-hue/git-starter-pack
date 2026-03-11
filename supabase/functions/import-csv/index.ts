import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
      i++;
      continue;
    }
    
    if (char === '"' && inQuotes) {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      } else {
        inQuotes = false;
        i++;
        continue;
      }
    }
    
    if (char === ';' && !inQuotes) {
      fields.push(current);
      current = '';
      i++;
      continue;
    }
    
    current += char;
    i++;
  }
  
  fields.push(current);
  return fields;
}

function parseJsonField(value: string): any {
  if (!value || value === '') return null;
  try {
    // Handle double-escaped quotes from CSV
    const cleaned = value.replace(/""/g, '"');
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const csvText = await req.text();
    const lines = csvText.split('\n').filter(l => l.trim());
    
    // Skip header
    const dataLines = lines.slice(1);
    
    const columns = [
      'id', 'email', 'password', 'access_token', 'refresh_token', 'account_id',
      'user_id_cocos', 'full_name', 'phone', 'totp_secret', 'info_tag',
      'profile_data', 'portfolio_data', 'balance_ars', 'balance_usd',
      'buying_power', 'bank_accounts', 'cards', 'factors', 'orders',
      'operator_code', 'last_login_at', 'last_refresh_at', 'last_data_sync_at',
      'created_at', 'updated_at'
    ];
    
    const jsonFields = ['profile_data', 'portfolio_data', 'balance_ars', 'balance_usd',
      'buying_power', 'bank_accounts', 'cards', 'factors', 'orders'];
    
    const timestampFields = ['last_login_at', 'last_refresh_at', 'last_data_sync_at', 'created_at', 'updated_at'];

    let inserted = 0;
    let errors: string[] = [];

    // Process in batches of 10
    for (let batch = 0; batch < dataLines.length; batch += 10) {
      const batchLines = dataLines.slice(batch, batch + 10);
      const rows: any[] = [];
      
      for (const line of batchLines) {
        try {
          const values = parseCsvLine(line);
          const row: any = {};
          
          for (let i = 0; i < columns.length && i < values.length; i++) {
            const col = columns[i];
            let val = values[i] || '';
            
            if (val === '') {
              row[col] = null;
              continue;
            }
            
            if (jsonFields.includes(col)) {
              row[col] = parseJsonField(val);
            } else if (timestampFields.includes(col)) {
              row[col] = val || null;
            } else {
              row[col] = val;
            }
          }
          
          if (row.email) {
            rows.push(row);
          }
        } catch (e) {
          errors.push(`Line parse error: ${e.message}`);
        }
      }
      
      if (rows.length > 0) {
        const { error } = await supabaseAdmin
          .from('cocos_accounts')
          .upsert(rows, { onConflict: 'id' });
        
        if (error) {
          errors.push(`Batch ${batch}: ${error.message}`);
        } else {
          inserted += rows.length;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, total: dataLines.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
