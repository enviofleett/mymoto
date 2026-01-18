-- Test if Trigger is Working After Configuration
-- Run this to verify the proactive-alarm-to-chat system is functioning

-- ============================================
-- STEP 1: Ensure Vehicle Assignment Exists
-- ============================================
-- Make sure TEST_DEVICE_001 has a user assigned
DO $$
DECLARE
  test_user_id UUID;
  test_profile_id UUID;
BEGIN
  -- Get first user
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Get or create profile
    SELECT id INTO test_profile_id 
    FROM profiles 
    WHERE user_id = test_user_id 
    LIMIT 1;
    
    IF test_profile_id IS NULL THEN
      INSERT INTO profiles (user_id, full_name)
      VALUES (test_user_id, 'Test User')
      RETURNING id INTO test_profile_id;
    END IF;
    
    -- Create vehicle assignment
    INSERT INTO vehicle_assignments (device_id, profile_id)
    VALUES ('TEST_DEVICE_001', test_profile_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- STEP 2: Ensure AI Chat Preferences are Enabled
-- ============================================
INSERT INTO vehicle_notification_preferences (device_id, user_id, enable_ai_chat_critical_battery)
SELECT 
  'TEST_DEVICE_001',
  u.id,
  true
FROM auth.users u
LIMIT 1
ON CONFLICT (device_id, user_id) DO UPDATE
SET enable_ai_chat_critical_battery = true;

-- ============================================
-- STEP 3: Create a Test Event
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
  'Trigger Test Event',
  'Testing if trigger is working after configuration',
  jsonb_build_object('test', true, 'timestamp', now())
)
RETURNING id as event_id, created_at;

-- ============================================
-- STEP 4: Wait and Check Results (Run this after 5-10 seconds)
-- ============================================
-- Wait a few seconds for the edge function to process, then run:

SELECT 
  'TRIGGER TEST RESULTS' as test_status,
  e.id as event_id,
  e.device_id,
  e.event_type,
  e.title,
  e.notified as event_notified,
  e.notified_at,
  CASE 
    WHEN e.notified = true THEN '✅ Trigger is working!'
    WHEN e.notified IS NULL THEN '⚠️ notified column may not exist'
    ELSE '❌ Trigger may not be working (check edge function logs)'
  END as status_message,
  COUNT(ch.id) as chat_messages_created,
  MAX(ch.created_at) as last_chat_message_time
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Trigger Test Event'
GROUP BY e.id, e.device_id, e.event_type, e.title, e.notified, e.notified_at
ORDER BY e.created_at DESC
LIMIT 1;

-- ============================================
-- STEP 5: Check Edge Function Status
-- ============================================
-- If notified is still false/null, check:
-- 1. Edge function logs in Supabase Dashboard
-- 2. Check if edge function is deployed
-- 3. Check if LOVABLE_API_KEY is set in Supabase secrets

-- ============================================
-- EXPECTED RESULTS
-- ============================================
-- ✅ If trigger is working:
--    - notified = true
--    - notified_at = timestamp
--    - chat_messages_created >= 1
--
-- ❌ If trigger is NOT working:
--    - notified = false or NULL
--    - chat_messages_created = 0
--    - Check edge function logs for errors
