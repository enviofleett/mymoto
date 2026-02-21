DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'proactive_vehicle_events'
      AND policyname = 'Authenticated users can view events'
  ) THEN
    EXECUTE 'DROP POLICY "Authenticated users can view events" ON public.proactive_vehicle_events';
  END IF;
END;
$$;

-- Ensure schema supports all alert features
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proactive_vehicle_events'
      AND column_name = 'message'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN message TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proactive_vehicle_events'
      AND column_name = 'email_sent'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN email_sent BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proactive_vehicle_events'
      AND column_name = 'email_sent_at'
  ) THEN
    ALTER TABLE public.proactive_vehicle_events
    ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'event_type' AND e.enumlabel = 'vehicle_moving'
  ) THEN
    ALTER TYPE event_type ADD VALUE 'vehicle_moving';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'event_type' AND e.enumlabel = 'predictive_briefing'
  ) THEN
    ALTER TYPE event_type ADD VALUE 'predictive_briefing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'event_type' AND e.enumlabel = 'morning_greeting'
  ) THEN
    ALTER TYPE event_type ADD VALUE 'morning_greeting';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicle_notification_preferences'
      AND column_name = 'predictive_briefing'
  ) THEN
    ALTER TABLE public.vehicle_notification_preferences
    ADD COLUMN predictive_briefing BOOLEAN DEFAULT false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_alarm_to_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  IF NEW.severity NOT IN ('error', 'critical') THEN
    RETURN NEW;
  END IF;

  IF NEW.email_sent IS TRUE THEN
    RETURN NEW;
  END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping alarm-to-email notification';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-alert-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
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
'Sends alert emails for critical/error proactive events via send-alert-email edge function.';

DROP TRIGGER IF EXISTS trigger_alarm_to_email ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_alarm_to_email
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_alarm_to_email();

COMMENT ON TRIGGER trigger_alarm_to_email ON public.proactive_vehicle_events IS
'Triggers when new critical/error proactive event is created. Calls send-alert-email edge function and uses email_sent for dedupe.';
