-- Add missing email templates to email_templates table
-- This allows admin to manage and activate/deactivate these email types

INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, sender_id) VALUES
('walletTopUp', 
 'Wallet Top-Up Email', 
 'Sent when a user''s wallet is manually credited by an admin', 
 'Wallet Top-Up: {{amount}} Added to Your Account',
 '{{body_content}}',
 '["userName", "amount", "newBalance", "description", "adminName", "walletLink"]'::jsonb,
 NULL),

('newUserBonusNotification', 
 'New User Bonus Email', 
 'Sent automatically to new users when they receive their registration bonus', 
 'Welcome Bonus: {{bonusAmount}} Added to Your Wallet',
 '{{body_content}}',
 '["userName", "bonusAmount", "walletLink"]'::jsonb,
 NULL)
ON CONFLICT (template_key) DO NOTHING;
