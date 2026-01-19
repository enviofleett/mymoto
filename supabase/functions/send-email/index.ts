import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { sendEmail, EmailTemplates, getEmailConfig } from "./email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendEmailRequest {
  template: 'alert' | 'passwordReset' | 'welcome' | 'tripSummary' | 'systemNotification';
  to: string | string[];
  data: Record<string, unknown>;
  customSubject?: string;
  customHtml?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if email is configured
    const config = getEmailConfig();
    if (!config) {
      return new Response(
        JSON.stringify({ 
          error: "Email service not configured",
          message: "Please configure GMAIL_USER and GMAIL_APP_PASSWORD in Supabase secrets"
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { template, to, data, customSubject, customHtml }: SendEmailRequest = await req.json();

    if (!template || !to) {
      return new Response(
        JSON.stringify({ error: "Template and recipient(s) are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let emailTemplate;

    // Generate template based on type
    switch (template) {
      case 'alert':
        emailTemplate = EmailTemplates.alert({
          severity: (data.severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
          title: (data.title as string) || 'Alert',
          message: (data.message as string) || '',
          vehicleName: data.vehicleName as string | undefined,
          timestamp: data.timestamp as string | undefined,
          metadata: data.metadata as Record<string, unknown> | undefined,
        });
        break;

      case 'passwordReset':
        if (!data.resetLink) {
          return new Response(
            JSON.stringify({ error: "resetLink is required for passwordReset template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        emailTemplate = EmailTemplates.passwordReset({
          resetLink: data.resetLink as string,
          userName: data.userName as string | undefined,
          expiresIn: data.expiresIn as string | undefined,
        });
        break;

      case 'welcome':
        if (!data.userName) {
          return new Response(
            JSON.stringify({ error: "userName is required for welcome template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        emailTemplate = EmailTemplates.welcome({
          userName: data.userName as string,
          loginLink: data.loginLink as string | undefined,
        });
        break;

      case 'tripSummary':
        if (!data.userName || !data.vehicleName || !data.date || !data.distance || !data.duration) {
          return new Response(
            JSON.stringify({ error: "userName, vehicleName, date, distance, and duration are required for tripSummary template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        emailTemplate = EmailTemplates.tripSummary({
          userName: data.userName as string,
          vehicleName: data.vehicleName as string,
          date: data.date as string,
          distance: data.distance as string,
          duration: data.duration as string,
          startLocation: data.startLocation as string | undefined,
          endLocation: data.endLocation as string | undefined,
          maxSpeed: data.maxSpeed as string | undefined,
          avgSpeed: data.avgSpeed as string | undefined,
        });
        break;

      case 'systemNotification':
        if (!data.title || !data.message) {
          return new Response(
            JSON.stringify({ error: "title and message are required for systemNotification template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        emailTemplate = EmailTemplates.systemNotification({
          title: data.title as string,
          message: data.message as string,
          actionLink: data.actionLink as string | undefined,
          actionText: data.actionText as string | undefined,
        });
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown template: ${template}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    // Override with custom values if provided
    const subject = customSubject || emailTemplate.subject;
    const html = customHtml || emailTemplate.html;

    // Send email
    await sendEmail({
      to,
      subject,
      html,
      text: emailTemplate.text,
    });

    const recipients = Array.isArray(to) ? to : [to];

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent successfully to ${recipients.length} recipient(s)`,
        recipients: recipients.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email] Error:", errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
