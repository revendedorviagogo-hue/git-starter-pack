import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // 1. Create admin user
    const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
      email: "admin1@email.com",
      password: "10101010",
      email_confirm: true,
    });
    if (adminError && !adminError.message.includes("already")) {
      console.error("Admin create error:", adminError);
    }

    // 2. Create elton user
    const { data: eltonUser, error: eltonError } = await supabaseAdmin.auth.admin.createUser({
      email: "elton@email.com",
      password: "10101010",
      email_confirm: true,
    });
    if (eltonError && !eltonError.message.includes("already")) {
      console.error("Elton create error:", eltonError);
    }

    // 3. Assign admin role to admin1
    if (adminUser?.user) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: adminUser.user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (roleError) console.error("Role error:", roleError);
    }

    // 4. Assign user role to elton
    if (eltonUser?.user) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: eltonUser.user.id, role: "user" }, { onConflict: "user_id,role" });
      if (roleError) console.error("Elton role error:", roleError);
    }

    // 5. Create operator for elton
    const { error: opError } = await supabaseAdmin
      .from("operators")
      .upsert(
        { code: "0001", name: "elton", user_id: eltonUser?.user?.id || "elton" },
        { onConflict: "code" }
      );
    // If upsert fails due to no unique constraint on code, just insert
    if (opError) {
      await supabaseAdmin.from("operators").insert({
        code: "0001",
        name: "elton",
        user_id: eltonUser?.user?.id || "elton",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        admin: adminUser?.user?.id,
        elton: eltonUser?.user?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
