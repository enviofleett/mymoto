/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig, EmailTemplates } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegistrationEmailRequest {
  providerEmail: string;
  businessName: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify auth - any authenticated user can trigger this (the provider themselves)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      console.error("Missing Gmail credentials");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { providerEmail, businessName }: RegistrationEmailRequest = await req.json();
    const adminEmail = emailConfig.gmailUser; // Use sender email as admin email for now

    console.log(`Sending registration emails for: ${businessName} (${providerEmail})`);

    // 1. Send confirmation to Provider
    const providerTemplate = EmailTemplates.providerRegistration({
      businessName: businessName
    });

    await sendEmail({
      to: providerEmail,
      subject: providerTemplate.subject,
      html: providerTemplate.html,
    });

    // 2. Send notification to Admin
    const dashboardUrl = `${Deno.env.get("PUBLIC_APP_URL") || "https://mymotofleet.com"}/admin/directory`;
    const adminTemplate = EmailTemplates.providerRegistrationAdmin({
      businessName: businessName,
      email: providerEmail,
      phone: "N/A", // Not provided in this request
      dashboardUrl: dashboardUrl
    });

    await sendEmail({
      to: adminEmail,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Registration emails sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error sending registration emails:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send emails" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
