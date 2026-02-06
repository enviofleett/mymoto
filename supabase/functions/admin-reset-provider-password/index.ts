import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create Supabase client with Service Role Key (admin access)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has admin role
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Missing userId or newPassword" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update the user's password
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Failed to update password:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send email notification (optional but recommended)
    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('service_providers')
      .select('email, business_name')
      .eq('user_id', userId)
      .single();

    if (!userDataError && userData?.email) {
      const emailConfig = getEmailConfig();
      if (emailConfig) {
        try {
          await sendEmail({
            to: userData.email,
            subject: "Your Password Has Been Reset",
            html: `
              <h2>Password Reset Notification</h2>
              <p>Hello ${userData.business_name || 'Partner'},</p>
              <p>An administrator has manually reset your password.</p>
              <p>Your new password is: <strong>${newPassword}</strong></p>
              <p>Please log in and change it immediately if you did not request this.</p>
              <p><a href="${Deno.env.get("PUBLIC_APP_URL") || "https://mymotofleet.com"}/auth">Login Here</a></p>
            `,
          });
        } catch (emailErr) {
          console.error("Failed to send notification email:", emailErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password updated successfully",
        user: updateData.user 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
