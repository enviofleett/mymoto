import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertEmailRequest {
  eventId: string;
  deviceId: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  error: "#ea580c",
  warning: "#ca8a04",
  info: "#2563eb",
};

const handler = async (req: Request): Promise<Response> => {
  console.log("send-alert-email function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPassword) {
      console.error("Missing Gmail credentials");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { eventId, deviceId, eventType, severity, title, message, metadata }: AlertEmailRequest = await req.json();

    console.log(`Processing alert email for event: ${eventId}, device: ${deviceId}, severity: ${severity}`);

    // Initialize Supabase client to get admin emails
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin users to send notifications to
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw rolesError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get admin emails from auth.users
    const adminEmails: string[] = [];
    for (const role of adminRoles) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(role.user_id);
      if (!userError && userData.user?.email) {
        adminEmails.push(userData.user.email);
      }
    }

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(
        JSON.stringify({ success: true, message: "No admin emails found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending alert to ${adminEmails.length} admin(s)`);

    // Get vehicle name if available
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("device_name")
      .eq("device_id", deviceId)
      .single();

    const vehicleName = vehicleData?.device_name || deviceId;

    // Build email HTML
    const severityColor = SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
    const timestamp = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vehicle Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${severityColor}; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                🚨 ${severity.toUpperCase()} ALERT
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px;">${title}</h2>
              
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <strong style="color: #71717a;">Vehicle:</strong>
                      <span style="color: #18181b; margin-left: 8px;">${vehicleName}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <strong style="color: #71717a;">Device ID:</strong>
                      <span style="color: #18181b; margin-left: 8px; font-family: monospace;">${deviceId}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <strong style="color: #71717a;">Event Type:</strong>
                      <span style="color: #18181b; margin-left: 8px;">${eventType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <strong style="color: #71717a;">Time:</strong>
                      <span style="color: #18181b; margin-left: 8px;">${timestamp}</span>
                    </td>
                  </tr>
                </table>
              </div>
              
              <div style="background-color: #fef3c7; border-left: 4px solid ${severityColor}; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">${message}</p>
              </div>
              
              ${metadata ? `
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; color: #71717a; font-size: 14px; text-transform: uppercase;">Additional Details</h3>
                <pre style="background-color: #f4f4f5; padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto; color: #18181b;">${JSON.stringify(metadata, null, 2)}</pre>
              </div>
              ` : ""}
              
              <p style="margin: 0; color: #71717a; font-size: 14px;">
                Please review this alert and take appropriate action if needed.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                MyMoto Fleet Management System
              </p>
              <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 11px;">
                This is an automated notification. Do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Send email using Gmail SMTP
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPassword,
        },
      },
    });

    await client.send({
      from: gmailUser,
      to: adminEmails,
      subject: `[${severity.toUpperCase()}] ${title} - ${vehicleName}`,
      content: message,
      html: emailHtml,
    });

    await client.close();

    console.log(`Alert email sent successfully to ${adminEmails.length} recipient(s)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email sent to ${adminEmails.length} admin(s)`,
        recipients: adminEmails.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-alert-email function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
