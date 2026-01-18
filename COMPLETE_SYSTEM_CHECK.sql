-- Complete System Check for Proactive Alarm-to-Chat
-- Run this to verify all components are ready

-- ============================================
-- 1. CONFIGURATION CHECK
-- ============================================
SELECT 
  'CONFIGURATION' as check_type,
  CASE WHEN (SELECT value FROM app_settings WHERE key = 'supabase_url') IS NOT NULL 
    THEN '✅ Configured' ELSE '❌ Missing' END as supabase_url,
  CASE WHEN (SELECT value FROM app_settings WHERE key = 'supabase_service_role_key') IS NOT NULL 
    THEN '✅ Configured' ELSE '❌ Missing' END as service_key;

-- ============================================
-- 2. TRIGGER CHECK
-- ============================================
SELECT 
  'TRIGGER' as check_type,
  tgname as trigger_name,
  CASE tgenabled WHEN 'O' THEN '✅ Enabled' ELSE '❌ Disabled' END as status
FROM pg_trigger
WHERE tgname = 'trigger_alarm_to_chat'
  AND tgrelid = 'proactive_vehicle_events'::regclass;

-- ============================================
-- 3. FUNCTION CHECK
-- ============================================
SELECT 
  'FUNCTION' as check_type,
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
-- 4. VEHICLE SETUP CHECK
-- ============================================
SELECT 
  'VEHICLE SETUP' as check_type,
  CASE WHEN EXISTS (SELECT 1 FROM vehicles WHERE device_id = 'TEST_DEVICE_001')
    THEN '✅ Vehicle exists' ELSE '❌ Vehicle missing' END as vehicle,
  CASE WHEN EXISTS (
    SELECT 1 FROM vehicle_assignments va
    JOIN profiles p ON p.id = va.profile_id
    WHERE va.device_id = 'TEST_DEVICE_001'
  ) THEN '✅ Has assignments' ELSE '❌ No assignments' END as assignments,
  CASE WHEN EXISTS (
    SELECT 1 FROM vehicle_notification_preferences 
    WHERE device_id = 'TEST_DEVICE_001' 
    AND enable_ai_chat_critical_battery = true
  ) THEN '✅ AI Chat enabled' ELSE '❌ AI Chat disabled' END as ai_chat;

-- ============================================
-- 5. SCHEMA CHECK
-- ============================================
SELECT 
  'SCHEMA' as check_type,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified'
  ) THEN '✅ notified column exists' ELSE '⚠️ notified column missing' END as notified_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vehicle_chat_history' AND column_name = 'is_proactive'
  ) THEN '✅ is_proactive column exists' ELSE '❌ is_proactive column missing' END as proactive_column;

-- ============================================
-- 6. CREATE TEST EVENT AND CHECK RESULTS
-- ============================================
-- This will create an event and immediately check if it gets processed
DO $$
DECLARE
  test_event_id UUID;
  wait_seconds INTEGER := 8;
BEGIN
  -- Create test event
  INSERT INTO proactive_vehicle_events (
    device_id, event_type, severity, title, message, metadata
  )
  VALUES (
    'TEST_DEVICE_001',
    'critical_battery',
    'critical',
    'Complete System Test',
    'Testing complete system after all fixes',
    jsonb_build_object('test', true, 'timestamp', now())
  )
  RETURNING id INTO test_event_id;
  
  RAISE NOTICE 'Test event created: %. Waiting % seconds for processing...', test_event_id, wait_seconds;
  
  -- Wait for edge function to process
  PERFORM pg_sleep(wait_seconds);
  
  -- Check results
  RAISE NOTICE 'Checking results...';
END $$;

-- Check the test event results
SELECT 
  'TEST RESULTS' as check_type,
  e.id as event_id,
  e.title,
  e.notified as is_notified,
  e.notified_at,
  CASE 
    WHEN e.notified = true THEN '✅ Event was notified!'
    WHEN e.notified IS NULL THEN '⚠️ notified column may not exist (check schema)'
    ELSE '❌ Event not notified - check edge function logs'
  END as notification_status,
  COUNT(ch.id) as chat_messages_created,
  CASE 
    WHEN COUNT(ch.id) > 0 THEN '✅ Chat message created!'
    ELSE '❌ No chat message created'
  END as chat_status,
  MAX(ch.created_at) as last_chat_time,
  EXTRACT(EPOCH FROM (NOW() - e.created_at))::INTEGER as seconds_ago
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Complete System Test'
GROUP BY e.id, e.title, e.notified, e.notified_at, e.created_at
ORDER BY e.created_at DESC
LIMIT 1;

-- ============================================
-- SUMMARY
-- ============================================
-- If all checks pass:
-- ✅ Configuration: Set
-- ✅ Trigger: Enabled
-- ✅ Function: Updated
-- ✅ Vehicle Setup: Complete
-- ✅ Schema: Correct
-- ✅ Test: Passed
--
-- If test fails, check:
-- 1. Edge function deployment
-- 2. Edge function logs
-- 3. LOVABLE_API_KEY secret
-- 4. Network connectivity
