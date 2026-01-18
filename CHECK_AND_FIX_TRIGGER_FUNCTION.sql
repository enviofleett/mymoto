-- Check and Fix Trigger Function
-- The trigger function may not have been updated to use app_settings
-- Let's verify and fix it

-- ============================================
-- STEP 1: Check Current Function Source
-- ============================================
SELECT 
  'CURRENT FUNCTION' as check_name,
  proname as function_name,
  SUBSTRING(prosrc, 1, 200) as function_source_preview
FROM pg_proc
WHERE proname = 'notify_alarm_to_chat';

-- ============================================
-- STEP 2: Update Function to Use app_settings
-- ============================================
-- This ensures it checks app_settings first (which is configured)
-- Then falls back to PostgreSQL settings

CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Try to get from app_settings table first (RECOMMENDED - already configured)
  SELECT value INTO supabase_url FROM app_settings WHERE key = 'supabase_url' LIMIT 1;
  SELECT value INTO service_role_key FROM app_settings WHERE key = 'supabase_service_role_key' LIMIT 1;
  
  -- Fallback to PostgreSQL settings if not in app_settings
  IF supabase_url IS NULL THEN
    supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;
  
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.supabase_service_role_key', true);
  END IF;
  
  -- Skip if settings still not configured
  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'Supabase URL or service role key not configured. Check app_settings table or PostgreSQL settings.';
    RETURN NEW;
  END IF;

  -- Call edge function asynchronously (don't wait for response)
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
        'message', COALESCE(NEW.message, NEW.title, ''),
        'metadata', COALESCE(NEW.metadata, '{}'::jsonb),
        'created_at', NEW.created_at
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail the original operation if notification fails
  -- Log error for debugging
  RAISE WARNING 'Failed to notify alarm-to-chat function: % (Event ID: %)', SQLERRM, NEW.id;
  RETURN NEW;
END;
$$;

-- ============================================
-- STEP 3: Verify Function Was Updated
-- ============================================
SELECT 
  'FUNCTION UPDATED' as status,
  proname as function_name,
  CASE 
    WHEN prosrc LIKE '%app_settings%' THEN '✅ Uses app_settings'
    ELSE '❌ Does not use app_settings'
  END as app_settings_check,
  CASE 
    WHEN prosrc LIKE '%net.http_post%' THEN '✅ Uses net.http_post'
    ELSE '❌ Does not use net.http_post'
  END as http_post_check
FROM pg_proc
WHERE proname = 'notify_alarm_to_chat';

-- ============================================
-- STEP 4: Test Again
-- ============================================
-- After running this, create a new test event:
-- INSERT INTO proactive_vehicle_events (
--   device_id, event_type, severity, title, message
-- )
-- VALUES (
--   'TEST_DEVICE_001', 'critical_battery', 'critical', 
--   'After Function Update', 'Testing after function update'
-- );
--
-- Wait 5-10 seconds, then check:
-- SELECT notified, notified_at FROM proactive_vehicle_events 
-- WHERE title = 'After Function Update';
