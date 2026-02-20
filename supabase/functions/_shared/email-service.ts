import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { validateEmailList, sanitizeHtml, escapeHtml, validateSenderId, validateEmail } from "./email-validation.ts";

export interface EmailConfig {
  gmailUser: string;
  gmailPassword: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  senderId?: string; // Custom sender ID from template
  supabase?: any; // Optional: Provide to check if template is active
  templateKey?: string; // Optional: Provide with supabase to check active status
}

export interface RenderTemplateOptions {
  supabase: any;
  templateKey: string;
  data: Record<string, unknown>;
  fallback: EmailTemplate;
  bypassStatusCheck?: boolean;
  rawHtmlKeys?: string[];
}

export interface RenderTemplateResult {
  template: EmailTemplate;
  senderId?: string;
  skipped: boolean;
  source: "db" | "fallback";
}

function hasTruthyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "false" || normalized === "0" || normalized === "null" || normalized === "undefined") {
      return false;
    }
    return true;
  }
  return true;
}

export function renderTemplateString(
  template: string,
  data: Record<string, unknown>,
  options?: { rawHtmlKeys?: string[] }
): string {
  const rawKeys = new Set(options?.rawHtmlKeys || []);
  const withConditionals = template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, variableName: string, content: string) => (hasTruthyValue(data[variableName]) ? content : "")
  );

  const withVariables = withConditionals.replace(/\{\{(\w+)\}\}/g, (_match, variableName: string) => {
    const value = data[variableName];
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    return rawKeys.has(variableName) ? stringValue : escapeHtml(stringValue);
  });

  return withVariables.replace(/\{\{[^}]+\}\}/g, "");
}

export async function renderEmailTemplate(
  options: RenderTemplateOptions
): Promise<RenderTemplateResult> {
  const { supabase, templateKey, data, fallback, bypassStatusCheck = false, rawHtmlKeys = ["body_content"] } = options;

  try {
    const { data: row, error } = await supabase
      .from("email_templates")
      .select("subject, html_content, text_content, sender_id, is_active")
      .eq("template_key", templateKey)
      .maybeSingle();

    if (error || !row) {
      return { template: fallback, skipped: false, source: "fallback" };
    }

    if (row.is_active === false && !bypassStatusCheck) {
      return { template: fallback, skipped: true, source: "db" };
    }

    const rendered: EmailTemplate = {
      subject: renderTemplateString(row.subject || fallback.subject, data, { rawHtmlKeys: [] }),
      html: renderTemplateString(row.html_content || fallback.html, data, { rawHtmlKeys }),
      text: row.text_content ? renderTemplateString(row.text_content, data, { rawHtmlKeys: [] }) : fallback.text,
    };

    return {
      template: rendered,
      senderId: row.sender_id || undefined,
      skipped: false,
      source: "db",
    };
  } catch (_err) {
    return { template: fallback, skipped: false, source: "fallback" };
  }
}

/**
 * Get Gmail SMTP credentials from environment variables
 */
export function getEmailConfig(): EmailConfig | null {
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
export async function sendEmail(options: EmailOptions): Promise<void> {
  // Check if template is active if supabase and templateKey are provided
  if (options.supabase && options.templateKey) {
    try {
      const { data, error } = await options.supabase
        .from('email_templates')
        .select('is_active')
        .eq('template_key', options.templateKey)
        .single();
      
      if (!error && data && data.is_active === false) {
        console.log(`[email-service] Skipping email: ${options.templateKey} is disabled in settings`);
        return;
      }
    } catch (err) {
      console.warn(`[email-service] Failed to check template status for ${options.templateKey}:`, err);
      // Continue anyway - better to send than to fail silently on db error
    }
  }

  // Validate recipients
  const emailValidation = validateEmailList(options.to);
  if (!emailValidation.valid || !emailValidation.validEmails) {
    throw new Error(emailValidation.error || 'Invalid email addresses');
  }

  // Validate sender ID
  if (options.senderId) {
    const senderValidation = validateSenderId(options.senderId);
    if (!senderValidation.valid) {
      throw new Error(senderValidation.error || 'Invalid sender ID');
    }
    options.senderId = senderValidation.formatted;
  }

  // Sanitize HTML content
  options.html = sanitizeHtml(options.html);
  
  // Escape subject (but allow & for readability)
  options.subject = escapeHtml(options.subject).replace(/&amp;/g, '&');

  const config = getEmailConfig();
  
  if (!config) {
    throw new Error("Email service not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.");
  }

  const senderEmailValidation = validateEmail(config.gmailUser);
  if (!senderEmailValidation.valid) {
    throw new Error(`Invalid GMAIL_USER: ${senderEmailValidation.error}`);
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

  // Use validated emails
  const recipients = emailValidation.validEmails;

  // Use senderId if provided, otherwise use from, otherwise use default Gmail user
  const fromAddress = options.senderId || options.from || config.gmailUser;

  await client.send({
    from: fromAddress,
    to: recipients,
    subject: options.subject,
    content: options.text || options.html,
    html: options.html,
    headers: {
      "Content-Transfer-Encoding": "8bit",
    },
  });

  await client.close();
}

/**
 * Email Templates
 */
export const EmailTemplates = {
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
    const content = `
      <h2>${data.title}</h2>
      <p>${data.message}</p>
      ${data.vehicleName ? `<p>Vehicle: ${data.vehicleName}</p>` : ''}
      ${data.timestamp ? `<p>Time: ${data.timestamp}</p>` : ''}
      ${data.metadata ? `<pre>${JSON.stringify(data.metadata, null, 2)}</pre>` : ''}
    `;

    return {
      subject: `[${data.severity.toUpperCase()}] ${data.title}${data.vehicleName ? ` - ${data.vehicleName}` : ''}`,
      html: content,
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
      <h2>Password Reset Request</h2>
      ${data.userName ? `<p>Hello ${data.userName},</p>` : ''}
      <p>Click the link below to reset your password:</p>
      <a href="${data.resetLink}">${data.resetLink}</a>
      ${data.expiresIn ? `<p>Expires in ${data.expiresIn}</p>` : ''}
    `;

    return {
      subject: "Reset Your MyMoto Fleet Password",
      html: content,
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
      <h2>Welcome to MyMoto Fleet!</h2>
      <p>Hello ${data.userName},</p>
      <p>Your account has been created.</p>
      ${data.loginLink ? `<a href="${data.loginLink}">Login Here</a>` : ''}
    `;

    return {
      subject: "Welcome to MyMoto Fleet",
      html: content,
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
      <h2>Trip Summary</h2>
      <p>Vehicle: ${data.vehicleName}</p>
      <p>Date: ${data.date}</p>
      <p>Distance: ${data.distance}</p>
      <p>Duration: ${data.duration}</p>
      ${data.startLocation ? `<p>Start Location: ${data.startLocation}</p>` : ''}
      ${data.endLocation ? `<p>End Location: ${data.endLocation}</p>` : ''}
      ${data.maxSpeed ? `<p>Max Speed: ${data.maxSpeed}</p>` : ''}
      ${data.avgSpeed ? `<p>Avg Speed: ${data.avgSpeed}</p>` : ''}
    `;

    return {
      subject: `Trip Summary - ${data.vehicleName} - ${data.date}`,
      html: content,
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
      <h2>${data.title}</h2>
      <p>${data.message}</p>
      ${data.actionLink ? `<a href="${data.actionLink}">${data.actionText || 'Click here'}</a>` : ''}
    `;

    return {
      subject: data.title,
      html: content,
    };
  },

  /**
   * Wallet Top-Up Email Template
   */
  walletTopUp: (data: {
    userName: string;
    amount: number;
    currency: string;
    newBalance: number;
    description?: string;
    adminName?: string;
    walletLink?: string;
  }): EmailTemplate => {
    const content = `
      <h2>Wallet Top-Up Confirmation</h2>
      <p>Amount: ${data.amount} ${data.currency}</p>
      <p>New Balance: ${data.newBalance} ${data.currency}</p>
      ${data.description ? `<p>Description: ${data.description}</p>` : ''}
      ${data.adminName ? `<p>Processed by: ${data.adminName}</p>` : ''}
      ${data.walletLink ? `<a href="${data.walletLink}">View Wallet</a>` : ''}
    `;

    return {
      subject: `Wallet Top-Up: ${data.amount} ${data.currency} Added`,
      html: content,
    };
  },

  /**
   * New User Bonus Notification Email Template
   */
  newUserBonusNotification: (data: {
    userName: string;
    bonusAmount: number;
    currency: string;
    walletLink?: string;
  }): EmailTemplate => {
    const content = `
      <h2>Welcome Bonus</h2>
      <p>You received ${data.bonusAmount} ${data.currency}</p>
      ${data.walletLink ? `<a href="${data.walletLink}">View Wallet</a>` : ''}
    `;

    return {
      subject: "Welcome Bonus Received!",
      html: content,
    };
  },

  /**
   * Provider Registration Received (Provider)
   */
  providerRegistration: (data: {
    businessName: string;
  }): EmailTemplate => {
    const content = `
      <h2>Registration Received</h2>
      <p>Hello ${data.businessName},</p>
      <p>Thank you for registering with Fleet Directory. We have received your application and it is currently under review.</p>
      <p>You will receive another email once your account has been approved by an administrator.</p>
    `;

    return {
      subject: `Registration Received - ${data.businessName}`,
      html: content,
    };
  },

  /**
   * Provider Registration Notification (Admin)
   */
  providerRegistrationAdmin: (data: {
    businessName: string;
    email: string;
    phone: string;
    category?: string;
    address?: string;
    location?: any;
    dashboardUrl: string;
  }): EmailTemplate => {
    const content = `
      <h2>New Service Provider Registration</h2>
      <p><strong>Business:</strong> ${data.businessName}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      ${data.category ? `<p><strong>Category:</strong> ${data.category}</p>` : ''}
      ${data.address ? `<p><strong>Address:</strong> ${data.address}</p>` : ''}
      <p>Please review and approve/reject in the admin dashboard.</p>
      <a href="${data.dashboardUrl}">Go to Admin Dashboard</a>
    `;

    return {
      subject: `New Provider Registration: ${data.businessName}`,
      html: content,
    };
  },

  /**
   * Provider Approval Email
   */
  providerApproval: (data: {
    businessName: string;
    loginUrl: string;
    password?: string;
  }): EmailTemplate => {
    const content = `
      <h2>Application Approved</h2>
      <p>Hello ${data.businessName},</p>
      <p>Congratulations! Your application to join Fleet Directory has been approved.</p>
      <p>You can now log in to your provider dashboard to complete your profile and start receiving bookings.</p>
      <a href="${data.loginUrl}">Login to Dashboard</a>
      ${data.password ? `<p><strong>Temporary Password:</strong> ${data.password}</p>` : ''}
    `;

    return {
      subject: `Application Approved - ${data.businessName}`,
      html: content,
      };
  },

  /**
   * Provider Rejection Email
   */
  providerRejection: (data: {
    businessName: string;
    reason: string;
  }): EmailTemplate => {
    const content = `
      <h2>Application Update</h2>
      <p>Hello ${data.businessName},</p>
      <p>Thank you for your interest in Fleet Directory. We have reviewed your application.</p>
      <p><strong>Application Status: Not Approved</strong></p>
      <p>Reason: ${data.reason}</p>
      <p>If you have questions or believe this is an error, please contact our support team.</p>
    `;

    return {
      subject: `Application Update - ${data.businessName}`,
      html: content,
    };
  },

  /**
   * Service Completion Notification (User)
   */
  serviceCompletion: (data: {
    providerName: string;
    rateUrl: string;
  }): EmailTemplate => {
    const content = `
      <h2>Service Completed!</h2>
      <p>Your service with <strong>${data.providerName}</strong> has been marked as completed.</p>
      <p>We hope you are satisfied with the service. Please take a moment to rate your experience.</p>
      <a href="${data.rateUrl}">Rate Provider</a>
    `;

    return {
      subject: `Service Completed - ${data.providerName}`,
      html: content,
    };
  }
};
