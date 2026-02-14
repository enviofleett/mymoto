-- Default wallet top-up validation limits
INSERT INTO public.billing_config (key, value, description, currency)
VALUES 
  ('wallet_topup_min', 1, 'Minimum admin top-up amount', 'NGN'),
  ('wallet_topup_max', 1000000, 'Maximum admin top-up amount', 'NGN'),
  ('wallet_topup_captcha_threshold', 200000, 'Require CAPTCHA for top-ups at or above this amount', 'NGN')
ON CONFLICT (key) DO NOTHING;

-- Optional hCaptcha site key storage (set via app_settings for client-side use)
INSERT INTO public.app_settings (key, value, metadata)
VALUES ('hcaptcha_site_key', '', '{"description":"hCaptcha site key for admin top-up form"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
