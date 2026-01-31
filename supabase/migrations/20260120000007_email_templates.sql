-- Migration: Email templates management
-- Allows admin to customize email templates for user registration and vehicle assignments

CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb, -- Available template variables as JSON array
    sender_id TEXT, -- Optional sender ID/email
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Ensure is_active is true by default for existing rows if needed
UPDATE public.email_templates SET is_active = true WHERE is_active IS NULL;

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

-- Insert default templates with variables
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, sender_id) VALUES
('welcome', 
 'Welcome Email', 
 'Sent to new users when they register', 
 'Welcome to MyMoto Fleet',
 '{{body_content}}',
 '["userName", "vehicleCount", "loginLink"]'::jsonb,
 NULL),

('vehicle_assignment', 
 'Vehicle Assignment Email', 
 'Sent when new vehicles are assigned to existing users', 
 'New Vehicle(s) Assigned to Your Account',
 '{{body_content}}',
 '["userName", "vehicleCount", "actionLink"]'::jsonb,
 NULL),

('alert',
 'Alert Email',
 'Sent for vehicle alerts and notifications',
 '[{{severity}}] {{title}}{{#if vehicleName}} - {{vehicleName}}{{/if}}',
 '{{body_content}}',
 '["severity", "title", "message", "vehicleName", "timestamp"]'::jsonb,
 NULL),

('passwordReset',
 'Password Reset Email',
 'Sent when users request a password reset',
 'Reset Your MyMoto Fleet Password',
 '{{body_content}}',
 '["resetLink", "userName", "expiresIn"]'::jsonb,
 NULL),

('tripSummary',
 'Trip Summary Email',
 'Sent after trip completion with trip details',
 'Trip Summary - {{vehicleName}} - {{date}}',
 '{{body_content}}',
 '["userName", "vehicleName", "date", "distance", "duration", "startLocation", "endLocation", "maxSpeed", "avgSpeed"]'::jsonb,
 NULL),

('systemNotification',
 'System Notification Email',
 'Generic system notifications and announcements',
 '{{title}}',
 '{{body_content}}',
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

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON public.email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON public.email_templates(is_active) WHERE is_active = true;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_email_templates_updated_at();
