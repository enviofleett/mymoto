import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { checkRateLimit, logEmailAttempt } from "../_shared/email-rate-limit.ts";
import { validateEmailList } from "../_shared/email-validation.ts";

// ============================================================================
// EMAIL SERVICE (Inlined from email-service.ts for single-file deployment)
// ============================================================================

interface EmailConfig {
  gmailUser: string;
  gmailPassword: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  senderId?: string; // Custom sender ID from template
}

/**
 * Get Gmail SMTP credentials from environment variables
 */
function getEmailConfig(): EmailConfig | null {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

  if (!gmailUser || !gmailPassword) {
    return null;
  }

  return { gmailUser, gmailPassword };
}

/**
 * Send email using Gmail SMTP
 */
async function sendEmail(options: EmailOptions): Promise<void> {
  const config = getEmailConfig();
  
  if (!config) {
    throw new Error("Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.");
  }

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: {
        username: config.gmailUser,
        password: config.gmailPassword,
      },
    },
  });

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Use senderId if provided, otherwise use from, otherwise use default Gmail user
  const fromAddress = options.senderId || options.from || config.gmailUser;

  await client.send({
    from: fromAddress,
    to: recipients,
    subject: options.subject,
    content: options.text || options.html,
    html: options.html,
  });

  await client.close();
}

/**
 * Base email template HTML structure
 */
function getBaseEmailTemplate(content: string, footerText?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet Management</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3b82f6; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">MyMoto Fleet</h1>
              <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">Fleet Management System</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                ${footerText || "MyMoto Fleet Management System"}
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
}

/**
 * Email Templates
 */
const EmailTemplates = {
  /**
   * Alert/Notification Email Template
   */
  alert: (data: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    vehicleName?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
  }): EmailTemplate => {
    const severityColors = {
      info: '#3b82f6',
      warning: '#f59e0b',
      error: '#ef4444',
      critical: '#dc2626',
    };

    const severityIcons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    const color = severityColors[data.severity];
    const icon = severityIcons[data.severity];

    const content = `
      <div style="margin-bottom: 24px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background-color: ${color}15; border-left: 4px solid ${color}; border-radius: 4px; margin-bottom: 16px;">
          <span style="font-size: 20px;">${icon}</span>
          <span style="color: ${color}; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">${data.severity}</span>
        </div>
        <h2 style="margin: 0 0 12px 0; color: #18181b; font-size: 20px; font-weight: 600;">${data.title}</h2>
        ${data.vehicleName ? `<p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;"><strong>Vehicle:</strong> ${data.vehicleName}</p>` : ''}
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">${data.message}</p>
        ${data.timestamp ? `<p style="margin: 0 0 16px 0; color: #71717a; font-size: 13px;"><strong>Time:</strong> ${data.timestamp}</p>` : ''}
        ${data.metadata && Object.keys(data.metadata).length > 0 ? `
          <div style="margin-top: 20px; padding: 12px; background-color: #f4f4f5; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; color: #71717a; font-size: 12px; font-weight: 600;">Additional Details:</p>
            <pre style="margin: 0; color: #3f3f46; font-size: 12px; white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(data.metadata, null, 2)}</pre>
          </div>
        ` : ''}
      </div>
    `;

    return {
      subject: `[${data.severity.toUpperCase()}] ${data.title}${data.vehicleName ? ` - ${data.vehicleName}` : ''}`,
      html: getBaseEmailTemplate(content),
    };
  },

  /**
   * Password Reset Email Template
   */
  passwordReset: (data: {
    resetLink: string;
    userName?: string;
    expiresIn?: string;
  }): EmailTemplate => {
    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Password Reset Request</h2>
        ${data.userName ? `<p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">Hello ${data.userName},</p>` : ''}
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
          We received a request to reset your password for your MyMoto Fleet account. Click the button below to reset your password:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${data.resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Reset Password</a>
        </div>
        <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
          Or copy and paste this link into your browser:<br>
          <a href="${data.resetLink}" style="color: #3b82f6; word-break: break-all;">${data.resetLink}</a>
        </p>
        ${data.expiresIn ? `<p style="margin: 16px 0 0 0; color: #f59e0b; font-size: 13px;">⚠️ This link will expire in ${data.expiresIn}.</p>` : ''}
        <p style="margin: 24px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
          If you didn't request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
    `;

    return {
      subject: "Reset Your MyMoto Fleet Password",
      html: getBaseEmailTemplate(content),
    };
  },

  /**
   * Welcome Email Template
   */
  welcome: (data: {
    userName: string;
    loginLink?: string;
  }): EmailTemplate => {
    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Welcome to MyMoto Fleet!</h2>
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
          Hello ${data.userName},
        </p>
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
          Your account has been successfully created. You can now access the MyMoto Fleet Management System to monitor and manage your vehicles.
        </p>
        ${data.loginLink ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${data.loginLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Get Started</a>
          </div>
        ` : ''}
        <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
          If you have any questions or need assistance, please don't hesitate to contact our support team.
        </p>
      </div>
    `;

    return {
      subject: "Welcome to MyMoto Fleet",
      html: getBaseEmailTemplate(content),
    };
  },

  /**
   * Trip Summary Email Template
   */
  tripSummary: (data: {
    userName: string;
    vehicleName: string;
    date: string;
    distance: string;
    duration: string;
    startLocation?: string;
    endLocation?: string;
    maxSpeed?: string;
    avgSpeed?: string;
  }): EmailTemplate => {
    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Trip Summary</h2>
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
          Hello ${data.userName},
        </p>
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
          Here's a summary of your trip on ${data.vehicleName}:
        </p>
        <div style="background-color: #f4f4f5; border-radius: 6px; padding: 20px; margin: 20px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 0; color: #71717a; font-size: 14px; width: 40%;"><strong>Date:</strong></td>
              <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.date}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Distance:</strong></td>
              <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.distance}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Duration:</strong></td>
              <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.duration}</td>
            </tr>
            ${data.startLocation ? `
              <tr>
                <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Start:</strong></td>
                <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.startLocation}</td>
              </tr>
            ` : ''}
            ${data.endLocation ? `
              <tr>
                <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>End:</strong></td>
                <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.endLocation}</td>
              </tr>
            ` : ''}
            ${data.maxSpeed ? `
              <tr>
                <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Max Speed:</strong></td>
                <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.maxSpeed}</td>
              </tr>
            ` : ''}
            ${data.avgSpeed ? `
              <tr>
                <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Avg Speed:</strong></td>
                <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${data.avgSpeed}</td>
              </tr>
            ` : ''}
          </table>
        </div>
      </div>
    `;

    return {
      subject: `Trip Summary - ${data.vehicleName} - ${data.date}`,
      html: getBaseEmailTemplate(content),
    };
  },

  /**
   * System Notification Email Template
   */
  systemNotification: (data: {
    title: string;
    message: string;
    actionLink?: string;
    actionText?: string;
  }): EmailTemplate => {
    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">${data.title}</h2>
        <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">${data.message}</p>
        ${data.actionLink && data.actionText ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${data.actionLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">${data.actionText}</a>
          </div>
        ` : ''}
      </div>
    `;

    return {
      subject: data.title,
      html: getBaseEmailTemplate(content),
    };
  },
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface SendEmailRequest {
  template: 'alert' | 'passwordReset' | 'welcome' | 'tripSummary' | 'systemNotification';
  to: string | string[];
  data: Record<string, unknown>;
  customSubject?: string;
  customHtml?: string;
  senderId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight - MUST be first and return 200 OK
  // This must be handled before any other code to ensure CORS works
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    // Verify user is authenticated and is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized",
          message: "Authentication required"
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client to verify user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized",
          message: "Invalid authentication token"
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ 
          error: "Forbidden",
          message: "Admin access required"
        }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let requestBody: SendEmailRequest;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      console.error("[send-email] JSON parsing error:", jsonError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body",
          success: false
        }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    const { template, to, data, customSubject, customHtml, senderId } = requestBody;

    if (!template || !to) {
      return new Response(
        JSON.stringify({ error: "Template and recipient(s) are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(user.id, supabase);
    if (!rateLimitCheck.allowed) {
      await logEmailAttempt(
        Array.isArray(to) ? to[0] : to,
        customSubject || 'Email',
        template,
        'rate_limited',
        rateLimitCheck.error || null,
        user.id,
        senderId || null,
        supabase
      );
      
      return new Response(
        JSON.stringify({
          error: rateLimitCheck.error || 'Rate limit exceeded',
          success: false,
          resetAt: rateLimitCheck.resetAt?.toISOString(),
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate emails
    const emailValidation = validateEmailList(to);
    if (!emailValidation.valid || !emailValidation.validEmails) {
      await logEmailAttempt(
        Array.isArray(to) ? to[0] : to,
        customSubject || 'Email',
        template,
        'validation_failed',
        emailValidation.error || null,
        user.id,
        senderId || null,
        supabase
      );
      
      return new Response(
        JSON.stringify({
          error: emailValidation.error || 'Invalid email addresses',
          success: false,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if email is configured
    const config = getEmailConfig();
    if (!config) {
      await logEmailAttempt(
        emailValidation.validEmails[0],
        customSubject || 'Email',
        template,
        'failed',
        'Email service not configured',
        user.id,
        senderId || null,
        supabase
      );
      
      return new Response(
        JSON.stringify({ 
          error: "Email service not configured",
          message: "Please configure GMAIL_USER and GMAIL_APP_PASSWORD in Supabase secrets"
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
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

    // Get sender ID from request if provided (already extracted above)
    const finalSenderId = senderId || (data.senderId as string | undefined);

    // Send email
    try {
      await sendEmail({
        to: emailValidation.validEmails,
        subject,
        html,
        text: emailTemplate.text,
        senderId: finalSenderId,
      });

      // Log successful send
      await logEmailAttempt(
        emailValidation.validEmails[0],
        subject,
        template,
        'sent',
        null,
        user.id,
        finalSenderId || null,
        supabase
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Email sent successfully to ${emailValidation.validEmails.length} recipient(s)`,
          recipients: emailValidation.validEmails.length,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (sendError: unknown) {
      const errorMessage = sendError instanceof Error ? sendError.message : "Unknown error";
      
      // Log failed send
      await logEmailAttempt(
        emailValidation.validEmails[0],
        subject,
        template,
        'failed',
        errorMessage,
        user.id,
        finalSenderId || null,
        supabase
      );
      
      throw sendError; // Re-throw to be caught by outer catch
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email] Error:", errorMessage);
    console.error("[send-email] Error details:", error);
    
    // Try to log the error (may fail if we don't have request body or user context)
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          await logEmailAttempt(
            'unknown',
            'Email',
            null,
            'failed',
            errorMessage,
            user.id,
            null,
            supabase
          );
        }
      }
    } catch (logError) {
      console.error("[send-email] Failed to log error:", logError);
    }
    
    // Ensure CORS headers are always included even on errors
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        } 
      }
    );
  }
};

serve(handler);
