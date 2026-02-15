-- Add email templates for vehicle onboarding request approval/rejection.
-- These are used by admin approval/rejection flows.

INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, sender_id)
VALUES
(
  'vehicle_request_approved',
  'Vehicle Request Approved',
  'Sent when an admin approves a vehicle onboarding request.',
  'Your vehicle request has been approved',
  '{{body_content}}',
  '["userName","deviceId","plateNumber","actionLink"]'::jsonb,
  NULL
),
(
  'vehicle_request_rejected',
  'Vehicle Request Rejected',
  'Sent when an admin rejects a vehicle onboarding request.',
  'Your vehicle request was rejected',
  '{{body_content}}',
  '["userName","plateNumber","adminNotes"]'::jsonb,
  NULL
)
ON CONFLICT (template_key) DO NOTHING;

