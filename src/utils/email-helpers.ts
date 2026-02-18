/**
 * Email Helper Utilities
 * 
 * Centralized functions for sending emails throughout the application.
 * All emails use the send-email edge function with appropriate templates.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SendEmailOptions {
  to: string | string[];
  template: 'alert' | 'passwordReset' | 'welcome' | 'tripSummary' | 'systemNotification';
  data: Record<string, unknown>;
  customSubject?: string;
  customHtml?: string;
}

/**
 * Send an email using the send-email edge function
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        template: options.template,
        to: options.to,
        data: options.data,
        customSubject: options.customSubject,
        customHtml: options.customHtml,
      },
    });

    if (error) {
      console.error(`[Email Helper] Error sending ${options.template} email:`, error);
      return { success: false, error: error.message || "Failed to send email" };
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[Email Helper] Exception sending ${options.template} email:`, err);
    return { success: false, error: err.message || "Unknown error" };
  }
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(
  userEmail: string,
  userName: string,
  loginLink?: string
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: userEmail,
    template: 'welcome',
    data: {
      userName,
      loginLink: loginLink || `${window.location.origin}/auth`,
    },
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  resetLink: string,
  userName?: string,
  expiresIn?: string
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: userEmail,
    template: 'passwordReset',
    data: {
      resetLink,
      userName,
      expiresIn: expiresIn || "1 hour",
    },
  });
}

/**
 * Send trip summary email
 */
export async function sendTripSummaryEmail(
  userEmail: string,
  options: {
    userName: string;
    vehicleName: string;
    date: string;
    distance: string;
    duration: string;
    startLocation?: string;
    endLocation?: string;
    maxSpeed?: string;
    avgSpeed?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: userEmail,
    template: 'tripSummary',
    data: options,
  });
}

/**
 * Send alert email (for vehicle alerts)
 */
export async function sendAlertEmail(
  userEmail: string | string[],
  options: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    vehicleName?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: userEmail,
    template: 'alert',
    data: options,
  });
}

/**
 * Send system notification email
 */
export async function sendSystemNotificationEmail(
  userEmail: string | string[],
  options: {
    title: string;
    message: string;
    actionLink?: string;
    actionText?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: userEmail,
    template: 'systemNotification',
    data: options,
  });
}

/**
 * Get email template from database
 */
async function getEmailTemplateFromDb(templateKey: string): Promise<{ subject: string; html: string } | null> {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('subject, html_content')
      .eq('template_key', templateKey)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.warn(`[Email Helper] Template '${templateKey}' not found in DB, using fallback`);
      return null;
    }

    return {
      subject: data.subject,
      html: data.html_content,
    };
  } catch (err) {
    console.error(`[Email Helper] Error fetching template from DB:`, err);
    return null;
  }
}

/**
 * Replace template variables (simple {{variable}} replacement)
 */
function replaceTemplateVariables(template: string, data: Record<string, unknown>): string {
  const withIfs = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, variable: string, content: string) => {
    const value = data[variable];
    return value ? content : "";
  });

  let result = withIfs;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, String(value || ""));
  }

  return result.replace(/\{\{[^}]+\}\}/g, "");
}

/**
 * Send vehicle assignment email notification (with database template support)
 */
export async function sendVehicleAssignmentEmail(
  userEmail: string,
  options: {
    userName: string;
    vehicleCount: number;
    isNewUser?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const { userName, vehicleCount, isNewUser = false } = options;
  
  // Get template from database (fallback to hardcoded if not found)
  const templateKey = isNewUser ? 'welcome' : 'vehicle_assignment';
  const dbTemplate = await getEmailTemplateFromDb(templateKey);
  
  if (dbTemplate) {
    // Use database template with variable replacement
    const subject = replaceTemplateVariables(dbTemplate.subject, { 
      vehicleCount,
      userName,
    });
    const html = replaceTemplateVariables(dbTemplate.html, {
      userName,
      vehicleCount: String(vehicleCount),
      loginLink: `${window.location.origin}/auth`,
      actionLink: `${window.location.origin}/fleet`,
    });
    
    return sendEmail({
      to: userEmail,
      template: isNewUser ? 'welcome' : 'systemNotification',
      data: isNewUser
        ? { userName, loginLink: `${window.location.origin}/auth` }
        : {
            title: `${vehicleCount} New Vehicle(s) Assigned`,
            message: `Hello ${userName}, ${vehicleCount} vehicle(s) have been assigned to your account.`,
            actionLink: `${window.location.origin}/fleet`,
            actionText: "View Vehicles",
          },
      customSubject: subject,
      customHtml: html,
    });
  }
  
  // Fallback to existing logic if database template not found
  if (isNewUser) {
    return sendEmail({
      to: userEmail,
      template: 'welcome',
      data: {
        userName,
        loginLink: `${window.location.origin}/auth`,
        vehicleCount,
        welcomeMessage: `Welcome to MyMoto! ${vehicleCount} vehicle(s) have been assigned to your account.`,
      },
    });
  } else {
    return sendEmail({
      to: userEmail,
      template: 'systemNotification',
      data: {
        title: `${vehicleCount} New Vehicle(s) Assigned`,
        message: `Hello ${userName}, ${vehicleCount} vehicle(s) have been assigned to your account. You can now access and monitor these vehicles in your dashboard.`,
        actionLink: `${window.location.origin}/fleet`,
        actionText: 'View Vehicles',
      },
    });
  }
}
