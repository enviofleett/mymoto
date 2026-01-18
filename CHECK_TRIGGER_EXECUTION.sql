-- Check if Trigger is Actually Being Called
-- If trigger fires, we should see WARNING messages in logs

-- ============================================
-- OPTION 1: Enable Verbose Logging
-- ============================================
-- Enable logging to see trigger warnings
SET client_min_messages TO WARNING;

-- ============================================
-- OPTION 2: Test Trigger Manually
-- ============================================
-- Check if we can call the function directly (simulated)
-- This won't work exactly like the trigger, but can help debug

-- ============================================
-- OPTION 3: Check if net Extension is Available
-- ============================================
SELECT 
  'EXTENSION CHECK' as check_type,
  extname as extension_name,
  extversion as version,
  CASE 
    WHEN extname = 'pg_net' THEN '✅ pg_net extension available'
    ELSE '⚠️ Extension status unknown'
  END as status
FROM pg_extension
WHERE extname IN ('pg_net', 'net')
ORDER BY extname;

-- ============================================
-- OPTION 4: Test net.http_post Directly
-- ============================================
-- Try to call net.http_post manually to see if it works
-- This will help identify if the issue is with net.http_post

DO $$
DECLARE
  test_url TEXT;
  test_key TEXT;
  request_id BIGINT;
BEGIN
  -- Get settings
  SELECT value INTO test_url FROM app_settings WHERE key = 'supabase_url' LIMIT 1;
  SELECT value INTO test_key FROM app_settings WHERE key = 'supabase_service_role_key' LIMIT 1;
  
  IF test_url IS NULL OR test_key IS NULL THEN
    RAISE WARNING 'Settings not configured for test';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing net.http_post with URL: %', test_url;
  
  -- Try to make a simple HTTP POST call
  BEGIN
    SELECT net.http_post(
      url := test_url || '/functions/v1/proactive-alarm-to-chat',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || test_key
      ),
      body := jsonb_build_object(
        'event', jsonb_build_object(
          'id', gen_random_uuid()::TEXT,
          'device_id', 'TEST_MANUAL',
          'event_type', 'test',
          'severity', 'info',
          'title', 'Manual Test',
          'message', 'Testing net.http_post directly',
          'created_at', now()::TEXT
        )
      )
    ) INTO request_id;
    
    RAISE NOTICE 'net.http_post call succeeded! Request ID: %', request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'net.http_post call failed: %', SQLERRM;
  END;
END $$;

-- ============================================
-- OPTION 5: Check Trigger Function for Errors
-- ============================================
-- Look at the actual function source to verify it's correct
SELECT 
  'FUNCTION SOURCE' as check_type,
  proname as function_name,
  prosrc as function_source
FROM pg_proc
WHERE proname = 'notify_alarm_to_chat'
LIMIT 1;

-- ============================================
-- RECOMMENDATION
-- ============================================
-- If net.http_post fails, the issue might be:
-- 1. pg_net extension not enabled → Enable it
-- 2. Network connectivity issue → Check Supabase network settings
-- 3. URL/key incorrect → Verify in app_settings
-- 4. Edge function not deployed → Deploy edge function
--
-- Alternative: Use Supabase Database Webhooks instead of net.http_post
-- This is more reliable and doesn't require pg_net extension
