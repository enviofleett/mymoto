-- Fix alarm-to-chat trigger to prevent duplicate notifications
-- This migration adds deduplication logic by checking the notified column

-- Update trigger function to check notified column before firing
CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- CRITICAL FIX: Skip if already notified to prevent duplicate messages
  -- Check if notified column exists and if event is already notified
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' 
    AND column_name = 'notified'
  ) THEN
    IF NEW.notified = true THEN
      RAISE NOTICE 'Event % already notified, skipping duplicate notification', NEW.id;
      RETURN NEW;
    END IF;
  END IF;

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
        'created_at', NEW.created_at,
        'latitude', NEW.latitude,
        'longitude', NEW.longitude,
        'location_name', NEW.location_name,
        'description', NEW.description
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the original operation if notification fails
  -- Log error for monitoring
  RAISE WARNING 'Failed to notify alarm-to-chat function: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Update trigger comment to reflect deduplication
COMMENT ON FUNCTION notify_alarm_to_chat IS 'Automatically posts new proactive events to vehicle chat via LLM. Includes deduplication check to prevent duplicate notifications.';

COMMENT ON TRIGGER trigger_alarm_to_chat ON public.proactive_vehicle_events IS 
'Triggers when new proactive event is created. Calls proactive-alarm-to-chat edge function to generate LLM message and post to chat. Skips if event is already notified.';
