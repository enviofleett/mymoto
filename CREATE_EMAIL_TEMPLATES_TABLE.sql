-- Create Email Templates Table
-- Run this in Supabase SQL Editor if the email_templates table doesn't exist

CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    sender_id TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Add sender_id column if table already exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'email_templates' 
        AND column_name = 'sender_id'
    ) THEN
        ALTER TABLE public.email_templates ADD COLUMN sender_id TEXT;
    END IF;
END $$;

-- Insert default templates
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, sender_id) VALUES
('welcome', 
 'Welcome Email', 
 'Sent to new users when they register', 
 'Welcome to MyMoto Fleet',
 '<div style="margin-bottom: 24px;">
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Welcome to MyMoto Fleet!</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Hello {{userName}},
  </p>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Your account has been successfully created. You can now access the MyMoto Fleet Management System to monitor and manage your vehicles.
  </p>
  {{#if vehicleCount}}
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    {{vehicleCount}} vehicle(s) have been assigned to your account.
  </p>
  {{/if}}
  {{#if loginLink}}
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{loginLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Get Started</a>
  </div>
  {{/if}}
  <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    If you have any questions or need assistance, please don''t hesitate to contact our support team.
  </p>
</div>',
 '["userName", "vehicleCount", "loginLink"]'::jsonb,
 NULL),

('vehicle_assignment', 
 'Vehicle Assignment Email', 
 'Sent when new vehicles are assigned to existing users', 
 'New Vehicle(s) Assigned to Your Account',
 '<div style="margin-bottom: 24px;">
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">{{vehicleCount}} New Vehicle(s) Assigned</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Hello {{userName}},
  </p>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    {{vehicleCount}} vehicle(s) have been assigned to your account. You can now access and monitor these vehicles in your dashboard.
  </p>
  {{#if actionLink}}
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{actionLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">View Vehicles</a>
  </div>
  {{/if}}
  <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    If you have any questions, please contact our support team.
  </p>
</div>',
 '["userName", "vehicleCount", "actionLink"]'::jsonb,
 NULL),

('alert',
 'Alert Email',
 'Sent for vehicle alerts and notifications',
 '[{{severity}}] {{title}}{{#if vehicleName}} - {{vehicleName}}{{/if}}',
 '<div style="margin-bottom: 24px;">
  <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background-color: {{severityColor}}15; border-left: 4px solid {{severityColor}}; border-radius: 4px; margin-bottom: 16px;">
    <span style="font-size: 20px;">{{severityIcon}}</span>
    <span style="color: {{severityColor}}; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">{{severity}}</span>
  </div>
  <h2 style="margin: 0 0 12px 0; color: #18181b; font-size: 20px; font-weight: 600;">{{title}}</h2>
  {{#if vehicleName}}
  <p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;"><strong>Vehicle:</strong> {{vehicleName}}</p>
  {{/if}}
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">{{message}}</p>
  {{#if timestamp}}
  <p style="margin: 0 0 16px 0; color: #71717a; font-size: 13px;"><strong>Time:</strong> {{timestamp}}</p>
  {{/if}}
</div>',
 '["severity", "title", "message", "vehicleName", "timestamp"]'::jsonb,
 NULL),

('passwordReset',
 'Password Reset Email',
 'Sent when users request a password reset',
 'Reset Your MyMoto Fleet Password',
 '<div style="margin-bottom: 24px;">
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Password Reset Request</h2>
  {{#if userName}}
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">Hello {{userName}},</p>
  {{/if}}
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    We received a request to reset your password for your MyMoto Fleet account. Click the button below to reset your password:
  </p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{resetLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Reset Password</a>
  </div>
  <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    Or copy and paste this link into your browser:<br>
    <a href="{{resetLink}}" style="color: #3b82f6; word-break: break-all;">{{resetLink}}</a>
  </p>
  {{#if expiresIn}}
  <p style="margin: 16px 0 0 0; color: #f59e0b; font-size: 13px;">⚠️ This link will expire in {{expiresIn}}.</p>
  {{/if}}
  <p style="margin: 24px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    If you didn''t request a password reset, please ignore this email or contact support if you have concerns.
  </p>
</div>',
 '["resetLink", "userName", "expiresIn"]'::jsonb,
 NULL),

('tripSummary',
 'Trip Summary Email',
 'Sent after trip completion with trip details',
 'Trip Summary - {{vehicleName}} - {{date}}',
 '<div style="margin-bottom: 24px;">
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Trip Summary</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Hello {{userName}},
  </p>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Here''s a summary of your trip on {{vehicleName}}:
  </p>
  <div style="background-color: #f4f4f5; border-radius: 6px; padding: 20px; margin: 20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px; width: 40%;"><strong>Date:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{date}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Distance:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{distance}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Duration:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{duration}}</td>
      </tr>
      {{#if startLocation}}
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Start:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{startLocation}}</td>
      </tr>
      {{/if}}
      {{#if endLocation}}
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>End:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{endLocation}}</td>
      </tr>
      {{/if}}
      {{#if maxSpeed}}
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Max Speed:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{maxSpeed}}</td>
      </tr>
      {{/if}}
      {{#if avgSpeed}}
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Avg Speed:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 14px;">{{avgSpeed}}</td>
      </tr>
      {{/if}}
    </table>
  </div>
</div>',
 '["userName", "vehicleName", "date", "distance", "duration", "startLocation", "endLocation", "maxSpeed", "avgSpeed"]'::jsonb,
 NULL),

('systemNotification',
 'System Notification Email',
 'Generic system notifications and announcements',
 '{{title}}',
 '<div style="margin-bottom: 24px;">
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">{{title}}</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">{{message}}</p>
  {{#if actionLink}}
  {{#if actionText}}
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{actionLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">{{actionText}}</a>
  </div>
  {{/if}}
  {{/if}}
</div>',
 '["title", "message", "actionLink", "actionText"]'::jsonb,
 NULL)
ON CONFLICT (template_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users can read email templates" ON public.email_templates;
CREATE POLICY "Authenticated users can read email templates"
ON public.email_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON public.email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON public.email_templates(is_active) WHERE is_active = true;

-- Trigger function
CREATE OR REPLACE FUNCTION public.update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_email_templates_updated_at();
