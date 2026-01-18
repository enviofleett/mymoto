-- Email System Triggers
-- Automatically send emails for various events

-- Function to send welcome email on user creation
CREATE OR REPLACE FUNCTION public.send_welcome_email_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get Supabase URL and service role key from environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  -- Skip if settings not configured
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping welcome email';
    RETURN NEW;
  END IF;

  -- Call send-welcome-email edge function asynchronously
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

-- Trigger to send welcome email on user signup
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON auth.users;
CREATE TRIGGER trigger_send_welcome_email
AFTER INSERT ON auth.users
FOR EACH ROW
WHEN (NEW.email IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.send_welcome_email_on_signup();

-- Function to send trip summary email after trip completion
CREATE OR REPLACE FUNCTION public.send_trip_summary_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  user_email TEXT;
  user_id_val UUID;
BEGIN
  -- Only send email if trip is completed (has end_time)
  IF NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get Supabase URL and service role key
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping trip summary email';
    RETURN NEW;
  END IF;

  -- Get user email from vehicle assignment
  SELECT p.user_id, u.email INTO user_id_val, user_email
  FROM vehicle_assignments va
  JOIN profiles p ON va.profile_id = p.id
  JOIN auth.users u ON p.user_id = u.id
  WHERE va.device_id = NEW.device_id
  LIMIT 1;

  -- Skip if no user found
  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call send-trip-summary-email edge function asynchronously
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-trip-summary-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'tripId', NEW.id,
      'userEmail', user_email,
      'userId', user_id_val
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to send trip summary email: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger to send trip summary email after trip completion
-- Note: This will only fire when a trip gets an end_time (completion)
DROP TRIGGER IF EXISTS trigger_send_trip_summary_email ON vehicle_trips;
CREATE TRIGGER trigger_send_trip_summary_email
AFTER UPDATE OF end_time ON vehicle_trips
FOR EACH ROW
WHEN (NEW.end_time IS NOT NULL AND (OLD.end_time IS NULL OR OLD.end_time IS DISTINCT FROM NEW.end_time))
EXECUTE FUNCTION public.send_trip_summary_email();
