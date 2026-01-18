-- Debug Trigger Issue
-- The trigger is configured but events aren't being notified
-- Let's check what's happening

-- ============================================
-- CHECK 1: Verify Trigger Exists and is Enabled
-- ============================================
SELECT 
  'TRIGGER STATUS' as check_name,
  tgname as trigger_name,
  tgenabled as is_enabled,
  CASE tgenabled
    WHEN 'O' THEN '✅ Enabled'
    WHEN 'D' THEN '❌ Disabled'
    ELSE '⚠️ Unknown'
  END as status
FROM pg_trigger
WHERE tgname = 'trigger_alarm_to_chat'
  AND tgrelid = 'proactive_vehicle_events'::regclass;

-- ============================================
-- CHECK 2: Check if notified column exists
-- ============================================
SELECT 
  'SCHEMA CHECK' as check_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND column_name IN ('notified', 'notified_at')
ORDER BY column_name;

-- ============================================
-- CHECK 3: Test if Trigger Function Can Access Settings
-- ============================================
-- This will show if the trigger function can see the settings
SELECT 
  'SETTINGS CHECK' as check_name,
  CASE 
    WHEN (SELECT value FROM app_settings WHERE key = 'supabase_url') IS NOT NULL 
    THEN '✅ Found in app_settings'
    ELSE '❌ Not in app_settings'
  END as app_settings_url,
  CASE 
    WHEN (SELECT value FROM app_settings WHERE key = 'supabase_service_role_key') IS NOT NULL 
    THEN '✅ Found in app_settings'
    ELSE '❌ Not in app_settings'
  END as app_settings_key,
  CASE 
    WHEN current_setting('app.settings.supabase_url', true) IS NOT NULL 
    THEN '✅ Found in postgres settings'
    ELSE '❌ Not in postgres settings'
  END as postgres_url,
  CASE 
    WHEN current_setting('app.settings.supabase_service_role_key', true) IS NOT NULL 
    THEN '✅ Found in postgres settings'
    ELSE '❌ Not in postgres settings'
  END as postgres_key;

-- ============================================
-- CHECK 4: Check Recent Events and Their Status
-- ============================================
SELECT 
  'RECENT EVENTS' as check_name,
  id,
  device_id,
  event_type,
  title,
  notified,
  notified_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))::INTEGER as seconds_ago
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- CHECK 5: Test Manual Trigger Call (if possible)
-- ============================================
-- This tests if the trigger function works when called directly
-- Note: This is a simplified test - the actual trigger context may differ
DO $$
DECLARE
  test_result TEXT;
BEGIN
  -- Try to check if function can access settings
  SELECT CASE 
    WHEN (SELECT value FROM app_settings WHERE key = 'supabase_url') IS NOT NULL 
    THEN 'Settings accessible'
    ELSE 'Settings NOT accessible'
  END INTO test_result;
  
  RAISE NOTICE 'Trigger function settings check: %', test_result;
END $$;

-- ============================================
-- RECOMMENDATION
-- ============================================
-- If trigger exists but events aren't being notified:
-- 1. Check Supabase Edge Function logs for errors
-- 2. Verify edge function is deployed: supabase functions list
-- 3. Verify LOVABLE_API_KEY is set in Supabase secrets
-- 4. Check if net.http_post extension is enabled
-- 5. Check trigger function source code for issues
