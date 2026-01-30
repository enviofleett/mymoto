/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendEmail, getEmailConfig } from "../_shared/email-service.ts";

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
    const providerHtml = `
      <div style="max-width: 600px; margin: 0 auto; font-family: sans-serif;">
        <h2 style="color: #1f2937;">Registration Received</h2>
        <p style="color: #4b5563;">
          Hello <strong>${businessName}</strong>,
        </p>
        <p style="color: #4b5563;">
          Thank you for registering with Fleet Directory. We have received your application and it is currently under review.
        </p>
        <p style="color: #4b5563;">
          You will receive another email once your account has been approved by an administrator.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          Fleet Management System
        </p>
      </div>
    `;

    await sendEmail({
      to: providerEmail,
      subject: `Registration Received - ${businessName}`,
      html: providerHtml,
    });

    // 2. Send notification to Admin
    const adminHtml = `
      <div style="max-width: 600px; margin: 0 auto; font-family: sans-serif;">
        <h2 style="color: #1f2937;">New Provider Registration</h2>
        <p style="color: #4b5563;">
          A new service provider has registered and is pending approval.
        </p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Business:</strong> ${businessName}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${providerEmail}</p>
        </div>
        <p style="color: #4b5563;">
          Please log in to the Admin Dashboard to review and approve this application.
        </p>
        <div style="margin-top: 24px;">
            <a href="${Deno.env.get("PUBLIC_APP_URL") || "https://app.fleethub.com"}/admin/directory" 
               style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
               Go to Admin Dashboard
            </a>
        </div>
      </div>
    `;

    await sendEmail({
      to: adminEmail,
      subject: `New Provider Registration: ${businessName}`,
      html: adminHtml,
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
