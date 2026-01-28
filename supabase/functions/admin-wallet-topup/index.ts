import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
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
      console.error("[admin-wallet-topup] No Authorization header provided");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract token (handle both "Bearer token" and just "token" formats)
    let token = authHeader.startsWith("Bearer ") 
      ? authHeader.replace("Bearer ", "").trim()
      : authHeader.trim();
    
    console.log("[admin-wallet-topup] Verifying token...");
    
    // Verify the user token using service role client
    const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !adminUser) {
      console.error("[admin-wallet-topup] Auth error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[admin-wallet-topup] User authenticated:", adminUser.id, adminUser.email);

    // Check if user is admin using RPC function (more reliable)
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: adminUser.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error("[admin-wallet-topup] Admin check failed:", { isAdmin, roleError });
      // Fallback check
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", adminUser.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!adminRole) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("[admin-wallet-topup] Admin role verified for user:", adminUser.id);

    const { wallet_id, amount, description, send_email } = await req.json();

    if (!wallet_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: wallet_id and amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get wallet and user info
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, user_id, balance, currency")
      .eq("id", wallet_id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user email and name
    const { data: { user: targetUser }, error: userError } = await supabase.auth.admin.getUserById(wallet.user_id);
    if (userError || !targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("user_id", wallet.user_id)
      .single();

    const userName = profile?.name || targetUser.email?.split("@")[0] || "User";
    const userEmail = targetUser.email || profile?.email;

    // Use atomic RPC function
    const reference = `admin_topup_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    const { data: rpcResult, error: rpcError } = await supabase.rpc("credit_wallet_atomic", {
      p_user_id: wallet.user_id,
      p_amount: amount,
      p_reference: reference,
      p_description: description || `Admin top-up by ${adminUser.email}`,
      p_metadata: {
        admin_id: adminUser.id,
        admin_email: adminUser.email,
        wallet_id: wallet_id
      }
    });

    if (rpcError) {
      console.error("RPC Error processing admin top-up:", rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rpcResult.success) {
      return new Response(
        JSON.stringify({ success: false, error: rpcResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newBalance = rpcResult.new_balance;

    // Send email notification if requested and email is configured
    if (send_email !== false && userEmail) {
      const emailConfig = getEmailConfig();
      if (emailConfig) {
        try {
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", adminUser.id)
            .single();

          const adminName = adminProfile?.name || adminUser.email || "Admin";

          const emailTemplate = EmailTemplates.walletTopUp({
            userName,
            amount,
            currency: wallet.currency || "NGN",
            newBalance,
            description: description || `Admin top-up`,
            adminName,
            walletLink: `${supabaseUrl.replace("/rest/v1", "")}/owner/wallet`,
          });

          await sendEmail({
            to: userEmail,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            senderId: "MyMoto Fleet <noreply@mymoto.com>",
            supabase,
            templateKey: "walletTopUp"
          });

          console.log(`Email notification sent to ${userEmail}`);
        } catch (emailError) {
          console.error("Failed to send email notification:", emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.log("Email service not configured, skipping email notification");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        wallet_id,
        amount,
        new_balance: newBalance,
        email_sent: send_email !== false && !!userEmail,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin wallet top-up error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
