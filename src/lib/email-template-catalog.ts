export type TemplateDraft = {
  subject: string;
  html_content: string;
  text_content?: string | null;
};

export type SeededTemplateKey =
  | "welcome"
  | "vehicle_assignment"
  | "alert"
  | "passwordReset"
  | "tripSummary"
  | "systemNotification"
  | "walletTopUp"
  | "newUserBonusNotification"
  | "vehicle_request_approved"
  | "vehicle_request_rejected";

export const PROFESSIONAL_TEMPLATE_DRAFTS: Record<SeededTemplateKey, TemplateDraft> = {
  welcome: {
    subject: "Welcome to MyMoto, {{userName}}",
    html_content: `<p>Hello {{userName}},</p>
<p>Welcome to MyMoto. Your account is now active{{#if vehicleCount}} and currently linked to {{vehicleCount}} vehicle(s){{/if}}.</p>
<p>You can sign in and start monitoring your fleet here: <a href="{{loginLink}}">Access Dashboard</a>.</p>
<p>If you need help getting started, reply to this email and our team will assist.</p>
<p>Best regards,<br/>MyMoto Team</p>`,
  },
  vehicle_assignment: {
    subject: "{{vehicleCount}} Vehicle(s) Added to Your MyMoto Account",
    html_content: `<p>Hello {{userName}},</p>
<p>We have successfully assigned {{vehicleCount}} vehicle(s) to your account.</p>
<p>To review live status, trips, and alerts, visit: <a href="{{actionLink}}">Open Dashboard</a>.</p>
<p>Best regards,<br/>MyMoto Team</p>`,
  },
  alert: {
    subject: "[{{severity}}] {{title}}{{#if vehicleName}} - {{vehicleName}}{{/if}}",
    html_content: `<p>Hello,</p>
<p>A vehicle alert has been triggered.</p>
<p><strong>Alert:</strong> {{title}}</p>
<p><strong>Severity:</strong> {{severity}}</p>
<p><strong>Vehicle:</strong> {{vehicleName}}</p>
<p><strong>Time:</strong> {{timestamp}}</p>
<p>{{message}}</p>
<p>Please review immediately in your dashboard.</p>
<p>MyMoto Monitoring</p>`,
  },
  passwordReset: {
    subject: "Reset Your MyMoto Password",
    html_content: `<p>Hello {{userName}},</p>
<p>We received a request to reset your password.</p>
<p>Use this secure link to continue: <a href="{{resetLink}}">Reset Password</a>.</p>
<p>This link expires in {{expiresIn}}.</p>
<p>If you did not request this change, please ignore this email.</p>
<p>MyMoto Security Team</p>`,
  },
  tripSummary: {
    subject: "Trip Summary - {{vehicleName}} - {{date}}",
    html_content: `<p>Hello {{userName}},</p>
<p>Here is your trip summary for <strong>{{vehicleName}}</strong> on <strong>{{date}}</strong>.</p>
<p><strong>Distance:</strong> {{distance}}<br/>
<strong>Duration:</strong> {{duration}}<br/>
<strong>Start:</strong> {{startLocation}}<br/>
<strong>End:</strong> {{endLocation}}<br/>
<strong>Max Speed:</strong> {{maxSpeed}}<br/>
<strong>Average Speed:</strong> {{avgSpeed}}</p>
<p>Thank you for using MyMoto.</p>`,
  },
  systemNotification: {
    subject: "{{title}}",
    html_content: `<p>Hello,</p>
<p>{{message}}</p>
<p>{{#if actionLink}}<a href="{{actionLink}}">{{actionText}}</a>{{/if}}</p>
<p>MyMoto Team</p>`,
  },
  walletTopUp: {
    subject: "Wallet Credited: {{amount}} Added",
    html_content: `<p>Hello {{userName}},</p>
<p>Your wallet has been credited with <strong>{{amount}}</strong>.</p>
<p><strong>New Balance:</strong> {{newBalance}}</p>
<p><strong>Reference:</strong> {{description}}</p>
<p><strong>Processed by:</strong> {{adminName}}</p>
<p>View your wallet activity: <a href="{{walletLink}}">Open Wallet</a>.</p>
<p>MyMoto Billing</p>`,
  },
  newUserBonusNotification: {
    subject: "Welcome Bonus Added: {{bonusAmount}}",
    html_content: `<p>Hello {{userName}},</p>
<p>Welcome to MyMoto. A registration bonus of <strong>{{bonusAmount}}</strong> has been added to your wallet.</p>
<p>You can review it here: <a href="{{walletLink}}">View Wallet</a>.</p>
<p>We are glad to have you with us.</p>
<p>MyMoto Team</p>`,
  },
  vehicle_request_approved: {
    subject: "Your Vehicle Request Has Been Approved",
    html_content: `<p>Hello {{userName}},</p>
<p>Your vehicle onboarding request has been approved.</p>
<p><strong>Plate Number:</strong> {{plateNumber}}<br/>
<strong>Device ID:</strong> {{deviceId}}</p>
<p>Continue here: <a href="{{actionLink}}">View My Vehicles</a>.</p>
<p>MyMoto Operations</p>`,
  },
  vehicle_request_rejected: {
    subject: "Update on Your Vehicle Request",
    html_content: `<p>Hello {{userName}},</p>
<p>Your vehicle onboarding request for <strong>{{plateNumber}}</strong> was not approved at this time.</p>
<p><strong>Admin Notes:</strong> {{adminNotes}}</p>
<p>Please update the request details and submit again if needed.</p>
<p>MyMoto Operations</p>`,
  },
};

