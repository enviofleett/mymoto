-- Migration: Email templates management
-- Allows admin to customize email templates for user registration and vehicle assignments

CREATE TABLE public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb, -- Available template variables as JSON array
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default templates with variables
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables) VALUES
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
 '["userName", "vehicleCount", "loginLink"]'::jsonb),

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
 '["userName", "vehicleCount", "actionLink"]'::jsonb)
ON CONFLICT (template_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read email templates"
ON public.email_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage email templates"
ON public.email_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for faster lookups
CREATE INDEX idx_email_templates_key ON public.email_templates(template_key);
CREATE INDEX idx_email_templates_active ON public.email_templates(is_active) WHERE is_active = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_email_templates_updated_at();
