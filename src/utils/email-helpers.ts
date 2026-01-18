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
