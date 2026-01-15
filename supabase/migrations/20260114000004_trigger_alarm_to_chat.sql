-- Create trigger to automatically post alarms to chat via LLM
-- When a new proactive_vehicle_event is created, call the proactive-alarm-to-chat edge function

-- Function to call edge function when event is created
CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get Supabase URL and service role key from settings
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.supabase_service_role_key', true);

  -- Skip if settings not configured
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured, skipping alarm-to-chat notification';
    RETURN NEW;
  END IF;

  -- Call edge function asynchronously (don't wait for response)
  -- This prevents blocking the event creation
  -- Only include columns guaranteed to exist in proactive_vehicle_events table
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/proactive-alarm-to-chat',
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
  -- Don't fail the original operation if notification fails
  RAISE WARNING 'Failed to notify alarm-to-chat function: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger on proactive_vehicle_events INSERT
-- Note: Trigger fires on all inserts since notified column may not exist
DROP TRIGGER IF EXISTS trigger_alarm_to_chat ON public.proactive_vehicle_events;
CREATE TRIGGER trigger_alarm_to_chat
AFTER INSERT ON public.proactive_vehicle_events
FOR EACH ROW
EXECUTE FUNCTION notify_alarm_to_chat();

COMMENT ON FUNCTION notify_alarm_to_chat IS 'Automatically posts new proactive events to vehicle chat via LLM';
COMMENT ON TRIGGER trigger_alarm_to_chat ON public.proactive_vehicle_events IS 
'Triggers when new proactive event is created. Calls proactive-alarm-to-chat edge function to generate LLM message and post to chat.';
