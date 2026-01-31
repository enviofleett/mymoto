import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, logEmailAttempt } from "../_shared/email-rate-limit.ts";
import { validateEmailList, sanitizeHtml, escapeHtml, validateSenderId } from "../_shared/email-validation.ts";
import { sendEmail, EmailTemplates, getEmailConfig } from "../_shared/email-service.ts";

// ============================================================================
// MAIN HANDLER
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface SendEmailRequest {
  template: 'alert' | 'passwordReset' | 'welcome' | 'tripSummary' | 'systemNotification';
  to: string | string[];
  data: Record<string, unknown>;
  customSubject?: string;
  customHtml?: string;
  senderId?: string;
  bypassStatusCheck?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
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
      console.error("[send-email] No Authorization header provided");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract token (handle both "Bearer token" and just "token" formats)
    let token = authHeader.startsWith("Bearer ") 
      ? authHeader.replace("Bearer ", "").trim()
      : authHeader.trim();
    
    console.log("[send-email] Verifying token...");
    
    // Verify the user token using service role client
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[send-email] Auth verification failed:", authError);
      return new Response(
        JSON.stringify({ 
          error: "Unauthorized",
          message: "Invalid or expired token. Please sign in again."
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[send-email] User authenticated:", user.id, user.email);

    // Check if user is admin using RPC function (more reliable)
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (roleError || !isAdmin) {
      console.error("[send-email] Admin check failed:", { isAdmin, roleError });
      // Fallback to direct query if RPC fails
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      if (!adminRole) {
        console.error("[send-email] User is not admin:", user.id);
        return new Response(
          JSON.stringify({ 
            error: "Forbidden",
            message: "Admin access required"
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    console.log("[send-email] Admin role verified for user:", user.id);

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

    const { template, to, data, customSubject, customHtml, senderId, bypassStatusCheck } = requestBody;

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

    // Generate default template first to provide {{body_content}}
    // This handles validation and default content generation
    let defaultTemplate;
    
    switch (template) {
      case 'alert':
        defaultTemplate = EmailTemplates.alert({
          severity: (data.severity as 'info' | 'warning' | 'error' | 'critical') || 'info',
          title: escapeHtml((data.title as string) || 'Alert'),
          message: escapeHtml((data.message as string) || ''),
          vehicleName: data.vehicleName ? escapeHtml(data.vehicleName as string) : undefined,
          timestamp: data.timestamp ? escapeHtml(data.timestamp as string) : undefined,
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
        defaultTemplate = EmailTemplates.passwordReset({
          resetLink: data.resetLink as string,
          userName: data.userName ? escapeHtml(data.userName as string) : undefined,
          expiresIn: data.expiresIn ? escapeHtml(data.expiresIn as string) : undefined,
        });
        break;

      case 'welcome':
        if (!data.userName) {
          return new Response(
            JSON.stringify({ error: "userName is required for welcome template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        defaultTemplate = EmailTemplates.welcome({
          userName: escapeHtml(data.userName as string),
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
        defaultTemplate = EmailTemplates.tripSummary({
          userName: escapeHtml(data.userName as string),
          vehicleName: escapeHtml(data.vehicleName as string),
          date: escapeHtml(data.date as string),
          distance: escapeHtml(data.distance as string),
          duration: escapeHtml(data.duration as string),
          startLocation: data.startLocation ? escapeHtml(data.startLocation as string) : undefined,
          endLocation: data.endLocation ? escapeHtml(data.endLocation as string) : undefined,
          maxSpeed: data.maxSpeed ? escapeHtml(data.maxSpeed as string) : undefined,
          avgSpeed: data.avgSpeed ? escapeHtml(data.avgSpeed as string) : undefined,
        });
        break;

      case 'systemNotification':
        if (!data.title || !data.message) {
          return new Response(
            JSON.stringify({ error: "title and message are required for systemNotification template" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        defaultTemplate = EmailTemplates.systemNotification({
          title: escapeHtml(data.title as string),
          message: escapeHtml(data.message as string),
          actionLink: data.actionLink as string | undefined,
          actionText: data.actionText ? escapeHtml(data.actionText as string) : undefined,
        });
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown template: ${template}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    // Add body_content to data for DB template variable replacement
    data.body_content = defaultTemplate.html;

    let emailTemplate = defaultTemplate;

    // ✅ FIX: Try to get template from database first (admin customizations)
    let dbTemplate = null;
    try {
      const { data: templateData, error: templateError } = await supabase
        .from('email_templates')
        .select('subject, html_content, is_active')
        .eq('template_key', template)
        .single();
      
      if (!templateError && templateData) {
        // If template is explicitly disabled in database, SKIP SENDING (unless bypassed for testing)
        if (templateData.is_active === false && !bypassStatusCheck) {
          console.log(`[send-email] Skipping email: ${template} is disabled in settings`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `Email sending skipped: ${template} is disabled by admin`,
              skipped: true 
            }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        dbTemplate = templateData;
        console.log(`[send-email] Using database template for: ${template}`);
      }
    } catch (dbError) {
      console.warn(`[send-email] Database template lookup failed, using fallback:`, dbError);
    }

    // If database template exists, use it (with variable replacement)
    if (dbTemplate) {
      // Simple variable replacement for database templates
      // Note: Database templates use {{variable}} syntax (not Handlebars)
      let dbSubject = dbTemplate.subject;
      let dbHtml = dbTemplate.html_content;
      
      // Replace template variables with escaped values
      for (const [key, value] of Object.entries(data)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        const valStr = String(value || '');
        // Don't escape body_content as it is already HTML
        const replacement = key === 'body_content' ? valStr : escapeHtml(valStr);
        dbSubject = dbSubject.replace(regex, replacement);
        dbHtml = dbHtml.replace(regex, replacement);
      }
      
      // Remove any remaining {{#if}} blocks (simple cleanup)
      dbSubject = dbSubject.replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, '');
      dbHtml = dbHtml.replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, '');
      
      emailTemplate = {
        subject: dbSubject,
        html: dbHtml,
        text: undefined,
      };
    }

    // Override with custom values if provided
    if (customSubject) {
      emailTemplate.subject = customSubject;
    }
    
    // ✅ FIX: Sanitize custom HTML and escape custom subject to prevent XSS
    const subject = customSubject ? escapeHtml(customSubject) : emailTemplate.subject;
    // ✅ FIX: Always sanitize HTML (even from templates) to be safe
    const html = sanitizeHtml(customHtml || emailTemplate.html);

    // ✅ FIX: Validate sender ID format
    const finalSenderId = senderId || (data.senderId as string | undefined);
    if (finalSenderId) {
      const senderValidation = validateSenderId(finalSenderId);
      if (!senderValidation.valid) {
        await logEmailAttempt(
          emailValidation.validEmails[0],
          subject,
          template,
          'validation_failed',
          senderValidation.error || 'Invalid sender ID format',
          user.id,
          null,
          supabase
        );
        
        return new Response(
          JSON.stringify({
            error: senderValidation.error || 'Invalid sender ID format',
            success: false,
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

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
