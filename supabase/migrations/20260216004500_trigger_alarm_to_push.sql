-- Trigger: when a new proactive_vehicle_event is created, call proactive-alarm-to-push edge function
-- This enables background Web Push delivery for installed PWAs.

CREATE OR REPLACE FUNCTION public.notify_alarm_to_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping alarm-to-push notification';
    RETURN NEW;
  END IF;

  -- Call edge function asynchronously (don't block inserts).
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/proactive-alarm-to-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'event', jsonb_build_object(
        'id', NEW.id,
        'device_id', NEW.device_id,
        'event_type', NEW.event_type,
        'severity', NEW.severity,
        'title', NEW.title,
        'message', COALESCE(NEW.message, ''),
        'metadata', COALESCE(NEW.metadata, '{}'::jsonb),
        'created_at', NEW.created_at
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify alarm-to-push function: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_alarm_to_push IS
'Sends Web Push notifications for new proactive events via proactive-alarm-to-push edge function.';

DROP TRIGGER IF EXISTS trigger_alarm_to_push ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_alarm_to_push
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_alarm_to_push();

COMMENT ON TRIGGER trigger_alarm_to_push ON public.proactive_vehicle_events IS
'Triggers when new proactive event is created. Calls proactive-alarm-to-push edge function to send Web Push notifications.';

