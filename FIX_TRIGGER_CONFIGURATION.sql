-- Fix Trigger Configuration for Proactive Alarm-to-Chat
-- The trigger needs Supabase URL and service role key to call the edge function

-- Option 1: Update trigger to use app_settings table (RECOMMENDED)
-- This is more reliable than PostgreSQL settings

CREATE OR REPLACE FUNCTION notify_alarm_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Try to get from app_settings table first
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
    RAISE WARNING 'Supabase URL or service role key not configured. Please set in app_settings table: supabase_url, supabase_service_role_key';
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
  RAISE WARNING 'Failed to notify alarm-to-chat function: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================
-- STEP 2: Store Supabase URL and Service Role Key
-- ============================================
-- Replace 'YOUR_SUPABASE_URL' with your actual Supabase project URL
-- Replace 'YOUR_SERVICE_ROLE_KEY' with your actual service role key
-- You can find these in Supabase Dashboard > Project Settings > API

-- Insert or update Supabase URL
INSERT INTO app_settings (key, value, metadata)
VALUES (
  'supabase_url',
  'YOUR_SUPABASE_URL',  -- Replace with actual URL, e.g., 'https://xxxxxxxxxxxxx.supabase.co'
  jsonb_build_object('description', 'Supabase project URL for edge function calls', 'updated_at', now())
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    metadata = EXCLUDED.metadata;

-- Insert or update service role key
INSERT INTO app_settings (key, value, metadata)
VALUES (
  'supabase_service_role_key',
  'YOUR_SERVICE_ROLE_KEY',  -- Replace with actual service role key
  jsonb_build_object('description', 'Service role key for edge function authentication', 'updated_at', now())
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    metadata = EXCLUDED.metadata;

-- ============================================
-- STEP 3: Verify Configuration
-- ============================================
SELECT 
  'CONFIGURATION CHECK' as status,
  CASE WHEN supabase_url IS NOT NULL THEN '✅ Configured' ELSE '❌ Missing' END as supabase_url_status,
  CASE WHEN service_key IS NOT NULL THEN '✅ Configured' ELSE '❌ Missing' END as service_key_status
FROM (
  SELECT 
    (SELECT value FROM app_settings WHERE key = 'supabase_url') as supabase_url,
    (SELECT value FROM app_settings WHERE key = 'supabase_service_role_key') as service_key
) config;

-- ============================================
-- NOTES:
-- ============================================
-- 1. Find your Supabase URL:
--    - Go to Supabase Dashboard > Project Settings > API
--    - Copy "Project URL" (e.g., https://xxxxxxxxxxxxx.supabase.co)
--
-- 2. Find your Service Role Key:
--    - Go to Supabase Dashboard > Project Settings > API
--    - Copy "service_role" key from "Project API keys" section
--    - ⚠️ WARNING: This key has admin privileges. Keep it secure!
--
-- 3. After setting values, test by creating a new proactive event
--
-- 4. Alternative: Use Supabase Edge Function Webhook (see webhook setup guide)
