import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, logEmailAttempt } from "../_shared/email-rate-limit.ts";
import { validateEmailList, sanitizeHtml, escapeHtml, validateSenderId } from "../_shared/email-validation.ts";
import { sendEmail, EmailTemplates, getEmailConfig, renderEmailTemplate } from "../_shared/email-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type SupportedTemplate =
  | "alert"
  | "passwordReset"
  | "welcome"
  | "tripSummary"
  | "systemNotification"
  | "vehicle_assignment"
  | "walletTopUp"
  | "newUserBonusNotification"
  | "new_user_bonus"
  | "vehicle_request_approved"
  | "vehicle_request_rejected";

interface SendEmailRequest {
  template: SupportedTemplate;
  to: string | string[];
  data: Record<string, unknown>;
  customSubject?: string;
  customHtml?: string;
  senderId?: string;
  bypassStatusCheck?: boolean;
}

function normalizeTemplateKey(template: SupportedTemplate): Exclude<SupportedTemplate, "new_user_bonus"> {
  return template === "new_user_bonus" ? "newUserBonusNotification" : template;
}

function getDefaultTemplate(template: Exclude<SupportedTemplate, "new_user_bonus">, data: Record<string, unknown>) {
  switch (template) {
    case "alert":
      return EmailTemplates.alert({
        severity: (data.severity as "info" | "warning" | "error" | "critical") || "info",
        title: escapeHtml((data.title as string) || "Alert"),
        message: escapeHtml((data.message as string) || ""),
        vehicleName: data.vehicleName ? escapeHtml(data.vehicleName as string) : undefined,
        timestamp: data.timestamp ? escapeHtml(data.timestamp as string) : undefined,
        metadata: data.metadata as Record<string, unknown> | undefined,
      });

    case "passwordReset":
      if (!data.resetLink) {
        throw new Error("resetLink is required for passwordReset template");
      }
      return EmailTemplates.passwordReset({
        resetLink: data.resetLink as string,
        userName: data.userName ? escapeHtml(data.userName as string) : undefined,
        expiresIn: data.expiresIn ? escapeHtml(data.expiresIn as string) : undefined,
      });

    case "welcome":
      if (!data.userName) {
        throw new Error("userName is required for welcome template");
      }
      return EmailTemplates.welcome({
        userName: escapeHtml(data.userName as string),
        loginLink: data.loginLink as string | undefined,
      });

    case "tripSummary":
      if (!data.userName || !data.vehicleName || !data.date || !data.distance || !data.duration) {
        throw new Error("userName, vehicleName, date, distance, and duration are required for tripSummary template");
      }
      return EmailTemplates.tripSummary({
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

    case "systemNotification":
      if (!data.title || !data.message) {
        throw new Error("title and message are required for systemNotification template");
      }
      return EmailTemplates.systemNotification({
        title: escapeHtml(data.title as string),
        message: escapeHtml(data.message as string),
        actionLink: data.actionLink as string | undefined,
        actionText: data.actionText ? escapeHtml(data.actionText as string) : undefined,
      });

    case "vehicle_assignment": {
      const userName = escapeHtml((data.userName as string) || "User");
      const vehicleCount = escapeHtml((data.vehicleCount as string | number) || "1");
      const actionLink = (data.actionLink as string) || "";
      return {
        subject: `${vehicleCount} Vehicle(s) Added to Your MyMoto Account`,
        html: `<p>Hello ${userName},</p><p>We have successfully assigned ${vehicleCount} vehicle(s) to your account.</p>${actionLink ? `<p><a href="${actionLink}">Open Dashboard</a>.</p>` : ""}<p>Best regards,<br/>MyMoto Team</p>`,
      };
    }

    case "walletTopUp":
      return EmailTemplates.walletTopUp({
        userName: escapeHtml((data.userName as string) || "User"),
        amount: Number(data.amount || 0),
        currency: (data.currency as string) || "NGN",
        newBalance: Number(data.newBalance || 0),
        description: data.description ? escapeHtml(data.description as string) : undefined,
        adminName: data.adminName ? escapeHtml(data.adminName as string) : undefined,
        walletLink: data.walletLink as string | undefined,
      });

    case "newUserBonusNotification":
      return EmailTemplates.newUserBonusNotification({
        userName: escapeHtml((data.userName as string) || "User"),
        bonusAmount: Number(data.bonusAmount || 0),
        currency: (data.currency as string) || "NGN",
        walletLink: data.walletLink as string | undefined,
      });

    case "vehicle_request_approved":
      return EmailTemplates.systemNotification({
        title: "Your vehicle request has been approved",
        message: `Your request for ${escapeHtml((data.plateNumber as string) || "your vehicle")} has been approved.`,
        actionLink: data.actionLink as string | undefined,
        actionText: "View vehicles",
      });

    case "vehicle_request_rejected":
      return EmailTemplates.systemNotification({
        title: "Your vehicle request was rejected",
        message: `Your request for ${escapeHtml((data.plateNumber as string) || "your vehicle")} was rejected.${data.adminNotes ? ` Notes: ${escapeHtml(data.adminNotes as string)}` : ""}`,
      });
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "").trim()
      : authHeader.trim();

    const isInternalServiceCall = token === supabaseServiceKey;
    let userIdForLogs: string | null = null;

    if (!isInternalServiceCall) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized", message: "Invalid or expired token. Please sign in again." }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userIdForLogs = user.id;

      const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin"
      });

      if (roleError || !isAdmin) {
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!adminRole) {
          return new Response(
            JSON.stringify({ error: "Forbidden", message: "Admin access required" }),
            { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
    }

    let requestBody: SendEmailRequest;
    try {
      requestBody = await req.json();
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body", success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { template, to, data, customSubject, customHtml, senderId, bypassStatusCheck } = requestBody;
    const normalizedTemplate = normalizeTemplateKey(template);

    if (!template || !to) {
      return new Response(
        JSON.stringify({ error: "Template and recipient(s) are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!isInternalServiceCall && userIdForLogs) {
      const rateLimitCheck = await checkRateLimit(userIdForLogs, supabase);
      if (!rateLimitCheck.allowed) {
        await logEmailAttempt(
          Array.isArray(to) ? to[0] : to,
          customSubject || "Email",
          normalizedTemplate,
          "rate_limited",
          rateLimitCheck.error || null,
          userIdForLogs,
          senderId || null,
          supabase
        );

        return new Response(
          JSON.stringify({
            error: rateLimitCheck.error || "Rate limit exceeded",
            success: false,
            resetAt: rateLimitCheck.resetAt?.toISOString(),
          }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const emailValidation = validateEmailList(to);
    if (!emailValidation.valid || !emailValidation.validEmails) {
      await logEmailAttempt(
        Array.isArray(to) ? to[0] : to,
        customSubject || "Email",
        normalizedTemplate,
        "validation_failed",
        emailValidation.error || null,
        userIdForLogs,
        senderId || null,
        supabase
      );

      return new Response(
        JSON.stringify({ error: emailValidation.error || "Invalid email addresses", success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const config = getEmailConfig();
    if (!config) {
      await logEmailAttempt(
        emailValidation.validEmails[0],
        customSubject || "Email",
        normalizedTemplate,
        "failed",
        "Email service not configured",
        userIdForLogs,
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

    let defaultTemplate;
    try {
      defaultTemplate = getDefaultTemplate(normalizedTemplate, data);
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || "Invalid request for template" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    data.body_content = defaultTemplate.html;

    const rendered = await renderEmailTemplate({
      supabase,
      templateKey: normalizedTemplate,
      data,
      fallback: defaultTemplate,
      bypassStatusCheck: !!bypassStatusCheck,
      rawHtmlKeys: ["body_content"],
    });

    if (rendered.skipped) {
      return new Response(
        JSON.stringify({ success: true, message: `Email sending skipped: ${normalizedTemplate} is disabled by admin`, skipped: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailTemplate = rendered.template;
    const subject = escapeHtml(customSubject || emailTemplate.subject);
    const html = sanitizeHtml(customHtml || emailTemplate.html);

    let finalSenderId = senderId || (data.senderId as string | undefined) || rendered.senderId;
    if (!finalSenderId) {
      const { data: senderRow } = await supabase
        .from("email_sender_names")
        .select("name")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      if (senderRow?.name) {
        finalSenderId = `${senderRow.name} <${config.gmailUser}>`;
      }
    }
    if (finalSenderId) {
      const senderValidation = validateSenderId(finalSenderId);
      if (!senderValidation.valid) {
        await logEmailAttempt(
          emailValidation.validEmails[0],
          subject,
          normalizedTemplate,
          "validation_failed",
          senderValidation.error || "Invalid sender ID format",
          userIdForLogs,
          null,
          supabase
        );

        return new Response(
          JSON.stringify({ error: senderValidation.error || "Invalid sender ID format", success: false }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    try {
      await sendEmail({
        to: emailValidation.validEmails,
        subject,
        html,
        text: emailTemplate.text,
        senderId: finalSenderId,
      });

      await logEmailAttempt(
        emailValidation.validEmails[0],
        subject,
        normalizedTemplate,
        "sent",
        null,
        userIdForLogs,
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

      await logEmailAttempt(
        emailValidation.validEmails[0],
        subject,
        normalizedTemplate,
        "failed",
        errorMessage,
        userIdForLogs,
        finalSenderId || null,
        supabase
      );

      throw sendError;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-email] Error:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
