/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RejectionEmailRequest {
  providerEmail: string;
  businessName: string;
  reason: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin (simplified check)
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!userRole) {
       // Also check via RPC if available, but this is a good fallback
       const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
       if (!isAdmin) {
         return new Response(
           JSON.stringify({ error: "Forbidden: Admin access required" }),
           { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
    }

    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { providerEmail, businessName, reason }: RejectionEmailRequest = await req.json();

    console.log(`Sending rejection email to: ${providerEmail}`);

    const emailHtml = `
      <div style="max-width: 600px; margin: 0 auto; font-family: sans-serif;">
        <h2 style="color: #1f2937;">Application Update</h2>
        <p style="color: #4b5563;">
          Hello <strong>${businessName}</strong>,
        </p>
        <p style="color: #4b5563;">
          Thank you for your interest in Fleet Directory. We have reviewed your application.
        </p>
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">Application Status: Not Approved</p>
          <p style="margin: 8px 0 0 0; color: #b91c1c;">
            Reason: ${reason}
          </p>
        </div>
        <p style="color: #4b5563;">
          If you have questions or believe this is an error, please contact our support team.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Fleet Management System
        </p>
      </div>
    `;

    await sendEmail({
      to: providerEmail,
      subject: `Application Update - ${businessName}`,
      html: emailHtml,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Rejection email sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error sending rejection email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
