DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE pg_proc.proname = 'notify_alarm_to_email'
      AND pg_namespace.nspname = 'public'
  ) THEN
    RAISE NOTICE 'notify_alarm_to_email does not exist, skipping update';
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_alarm_to_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.severity NOT IN ('error', 'critical') THEN
    RETURN NEW;
  END IF;

  IF NEW.email_sent IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/send-alert-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'eventId', NEW.id,
      'deviceId', NEW.device_id,
      'eventType', NEW.event_type,
      'severity', NEW.severity,
      'title', NEW.title,
      'message', COALESCE(NEW.message, NEW.description, ''),
      'metadata', COALESCE(NEW.metadata, '{}'::jsonb)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify alarm-to-email function: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_alarm_to_email IS
'Sends alert emails for critical/error proactive events via send-alert-email edge function without requiring custom GUCs.';

