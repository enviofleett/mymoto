-- Final Test: Verify Trigger is Working After Function Update
-- The function now uses app_settings, so it should work

-- ============================================
-- STEP 1: Create a New Test Event
-- ============================================
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  metadata
)
VALUES (
  'TEST_DEVICE_001',
  'critical_battery',
  'critical',
  'Final Trigger Test',
  'Testing trigger after function update to use app_settings',
  jsonb_build_object('test', true, 'timestamp', now())
)
RETURNING 
  id as event_id,
  created_at,
  'Event created - waiting for trigger...' as status;

-- ============================================
-- STEP 2: Wait 5-10 seconds, then check results
-- ============================================
-- Run this query after waiting a few seconds:

SELECT 
  'FINAL TEST RESULTS' as test_status,
  e.id as event_id,
  e.device_id,
  e.title,
  e.notified as is_notified,
  e.notified_at,
  CASE 
    WHEN e.notified = true THEN '✅ SUCCESS - Trigger is working!'
    WHEN e.notified IS NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified') = 0 
    THEN '⚠️ notified column does not exist - but trigger may still work'
    ELSE '❌ Trigger may not be working - check edge function logs'
  END as status_message,
  COUNT(ch.id) as chat_messages_created,
  MAX(ch.created_at) as last_chat_message_time,
  EXTRACT(EPOCH FROM (NOW() - e.created_at))::INTEGER as seconds_since_creation
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Final Trigger Test'
GROUP BY e.id, e.device_id, e.title, e.notified, e.notified_at, e.created_at
ORDER BY e.created_at DESC
LIMIT 1;

-- ============================================
-- STEP 3: Check Edge Function Status
-- ============================================
-- If notified is still false/null, check:
-- 1. Edge function deployment: supabase functions list
-- 2. Edge function logs: Supabase Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
-- 3. LOVABLE_API_KEY secret: Supabase Dashboard → Project Settings → Edge Functions → Secrets

-- ============================================
-- STEP 4: Verify Vehicle Assignment and Preferences
-- ============================================
-- Make sure these are set for TEST_DEVICE_001:

-- Check vehicle assignment
SELECT 
  'VEHICLE ASSIGNMENT' as check_name,
  va.device_id,
  COUNT(DISTINCT p.user_id) as assigned_users
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
WHERE va.device_id = 'TEST_DEVICE_001'
GROUP BY va.device_id;

-- Check AI chat preferences
SELECT 
  'AI CHAT PREFERENCES' as check_name,
  vnp.device_id,
  vnp.user_id,
  vnp.enable_ai_chat_critical_battery
FROM vehicle_notification_preferences vnp
WHERE vnp.device_id = 'TEST_DEVICE_001';

-- ============================================
-- EXPECTED RESULTS IF WORKING:
-- ============================================
-- ✅ notified = true
-- ✅ notified_at = timestamp
-- ✅ chat_messages_created >= 1
-- ✅ last_chat_message_time = recent timestamp
--
-- If all are ✅, the system is working correctly!
