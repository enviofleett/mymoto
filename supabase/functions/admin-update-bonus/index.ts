import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[admin-update-bonus] No Authorization header provided");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract token (handle both "Bearer token" and just "token" formats)
    let token = authHeader.startsWith("Bearer ") 
      ? authHeader.replace("Bearer ", "").trim()
      : authHeader.trim();
    
    console.log("[admin-update-bonus] Verifying token (length:", token.length, ")...");
    
    // Verify the user token using service role client
    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError) {
      console.error("[admin-update-bonus] Auth error:", {
        message: authError.message,
        status: authError.status,
        name: authError.name
      });
      return new Response(
        JSON.stringify({ success: false, error: `Unauthorized: ${authError.message}` }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!adminUser) {
      console.error("[admin-update-bonus] No user found for token");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-update-bonus] User authenticated:", adminUser.id, adminUser.email);

    // Check if user is admin using RPC function (more reliable than direct query)
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: adminUser.id,
      _role: 'admin'
    });

    if (roleError) {
      console.error("[admin-update-bonus] Role check error:", roleError);
      // Fallback to direct query if RPC fails
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", adminUser.id)
        .eq("role", "admin")
        .maybeSingle();
      
      if (!adminRole) {
        console.error("[admin-update-bonus] User is not admin (fallback check):", adminUser.id);
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!isAdmin) {
      console.error("[admin-update-bonus] User is not admin (RPC check):", adminUser.id);
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-update-bonus] Admin role verified for user:", adminUser.id);

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount } = body;

    if (amount === undefined || amount === null || isNaN(amount) || amount < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid amount. Must be a number >= 0" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert amount to decimal (ensure it's a number, not string)
    const bonusAmount = parseFloat(String(amount));
    if (isNaN(bonusAmount) || bonusAmount < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid amount format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-update-bonus] Updating new_user_bonus to:", bonusAmount);

    // Check if record exists first
    const { data: existingConfig } = await supabase
      .from("billing_config")
      .select("id, key, value")
      .eq("key", "new_user_bonus")
      .single();

    console.log("[admin-update-bonus] Existing config:", existingConfig);

    // Use upsert to create or update the billing config
    // This ensures it works even if the record doesn't exist yet
    const { data: configData, error: updateError } = await supabase
      .from("billing_config")
      .upsert({ 
        key: "new_user_bonus",
        value: bonusAmount,
        currency: "NGN",
        description: "Automatic wallet credit for new user registrations",
        updated_at: new Date().toISOString(),
        updated_by: adminUser.id,
      }, {
        onConflict: "key"
      })
      .select()
      .single();

    if (updateError) {
      console.error("[admin-update-bonus] Database error:", {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint
      });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to update new user bonus: ${updateError.message || 'Unknown database error'}`,
          details: updateError.details || null
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-update-bonus] Successfully updated:", configData);

    return new Response(
      JSON.stringify({
        success: true,
        amount: bonusAmount,
        message: `New user bonus updated to ₦${bonusAmount.toLocaleString()}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Update bonus error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
