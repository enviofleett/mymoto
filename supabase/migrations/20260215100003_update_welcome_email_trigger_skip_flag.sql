-- Allow admin-created users to opt out of the auth.users welcome-email trigger.
-- Admin flows can set raw_user_meta_data.skip_welcome_email = true and send welcome themselves.

CREATE OR REPLACE FUNCTION public.send_welcome_email_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  skip_flag TEXT;
BEGIN
  -- Skip if caller requested it via metadata (e.g. admin-created users).
  skip_flag := COALESCE(NEW.raw_user_meta_data->>'skip_welcome_email', '');
  IF lower(skip_flag) = 'true' THEN
    RETURN NEW;
  END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping welcome email';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'userId', NEW.id,
      'userEmail', NEW.email
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to send welcome email: %', SQLERRM;
  RETURN NEW;
END;
$$;

