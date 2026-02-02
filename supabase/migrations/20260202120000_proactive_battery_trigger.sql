-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 1. Create Trigger Function to Call Edge Function on Low Battery
CREATE OR REPLACE FUNCTION trigger_low_battery_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  should_notify BOOLEAN;
BEGIN
  -- Threshold Check: Only trigger if battery drops below 15% AND was previously >= 15% (to avoid spam)
  -- Or if it's a new record and < 15%
  IF (NEW.battery_percent < 15 AND (OLD.battery_percent IS NULL OR OLD.battery_percent >= 15)) THEN
    
    -- Get Secrets
    -- NOTE: In production, use `vault.decrypted_secrets` or `app.settings`
    -- For now, we assume these are set in postgres settings or we use a hardcoded fallback/error
    BEGIN
      supabase_url := current_setting('app.settings.supabase_url', true);
      service_role_key := current_setting('app.settings.supabase_service_role_key', true);
    EXCEPTION WHEN OTHERS THEN
      supabase_url := NULL;
      service_role_key := NULL;
    END;

    IF supabase_url IS NULL OR service_role_key IS NULL THEN
      -- Log warning if keys missing
      RAISE WARNING 'Supabase URL/Key not set for low battery notification';
      RETURN NEW;
    END IF;

    -- Call Edge Function via pg_net (Async)
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/proactive-chat-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'device_id', NEW.device_id,
        'trigger_type', 'low_battery',
        'data', jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'latitude', NEW.latitude,
          'longitude', NEW.longitude
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach Trigger to vehicle_positions
DROP TRIGGER IF EXISTS check_low_battery_trigger ON vehicle_positions;
CREATE TRIGGER check_low_battery_trigger
AFTER INSERT OR UPDATE OF battery_percent ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION trigger_low_battery_notification();

-- Comments
COMMENT ON FUNCTION trigger_low_battery_notification IS 'Triggers proactive-chat-notification Edge Function when battery drops below 15%';
