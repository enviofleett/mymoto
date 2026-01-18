-- Test Simulation Script for Proactive Alarm-to-Chat System
-- Run this script to test various scenarios

-- ============================================
-- SETUP: Create test data
-- ============================================

-- 1. Create a test vehicle (if not exists)
INSERT INTO vehicles (device_id, device_name)
VALUES ('TEST_DEVICE_001', 'Test Vehicle')
ON CONFLICT (device_id) DO NOTHING;

-- 2. Create test user assignment
-- NOTE: This will use the first available user. For production, specify a specific user_id
DO $$
DECLARE
  test_user_id UUID;
  test_profile_id UUID;
BEGIN
  -- Get first user
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Get or create profile for this user
    SELECT id INTO test_profile_id 
    FROM profiles 
    WHERE user_id = test_user_id 
    LIMIT 1;
    
    -- If no profile exists, create one
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

-- 3. Set up LLM settings for test vehicle
-- Note: Using 'professional' for initial test. After running migration 20260120000005_add_funny_personality_mode.sql, you can use 'funny'
INSERT INTO vehicle_llm_settings (device_id, nickname, personality_mode, language_preference)
VALUES ('TEST_DEVICE_001', 'Testy', 'professional', 'english')
ON CONFLICT (device_id) DO UPDATE
SET nickname = EXCLUDED.nickname,
    personality_mode = EXCLUDED.personality_mode,
    language_preference = EXCLUDED.language_preference;

-- 4. Set up notification preferences (enable AI chat for critical events)
INSERT INTO vehicle_notification_preferences (device_id, user_id, enable_ai_chat_critical_battery, enable_ai_chat_offline)
VALUES ('TEST_DEVICE_001', (SELECT id FROM auth.users LIMIT 1), true, true)
ON CONFLICT (device_id, user_id) DO UPDATE
SET enable_ai_chat_critical_battery = EXCLUDED.enable_ai_chat_critical_battery,
    enable_ai_chat_offline = EXCLUDED.enable_ai_chat_offline;

-- ============================================
-- TEST SCENARIOS
-- ============================================

-- TEST 1: Basic Critical Battery Event
-- Expected: Chat message created with LLM-generated text
-- Note: Table uses 'message' column, not 'description'
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
  'Critical Battery Level',
  'Battery dropped to 8%. Immediate attention required.',
  jsonb_build_object('battery_percent', 8, 'previous_percent', 15)
);

-- Wait a few seconds for edge function to process
-- Then check results:
SELECT 
  'TEST 1: Critical Battery' as test_name,
  e.id as event_id,
  e.notified,
  e.notified_at,
  COUNT(ch.id) as chat_messages_created,
  ch.content as chat_message_preview
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.event_type = 'critical_battery'
  AND e.created_at > NOW() - INTERVAL '5 minutes'
GROUP BY e.id, e.notified, e.notified_at, ch.content
ORDER BY e.created_at DESC
LIMIT 1;

-- TEST 2: Duplicate Prevention
-- Expected: Second event should be skipped (already notified)
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
)
VALUES (
  'TEST_DEVICE_001',
  'critical_battery',
  'critical',
  'Critical Battery Level (Duplicate)',
  'Battery dropped to 7%. This should be skipped if first event was processed.'
);

-- Check if duplicate was prevented:
SELECT 
  'TEST 2: Duplicate Prevention' as test_name,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as notified_events,
  COUNT(*) FILTER (WHERE notified = false) as pending_events
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND event_type = 'critical_battery'
  AND created_at > NOW() - INTERVAL '5 minutes';

-- TEST 3: AI Chat Disabled
-- Expected: No chat message created (preference disabled)
UPDATE vehicle_notification_preferences
SET enable_ai_chat_critical_battery = false
WHERE device_id = 'TEST_DEVICE_001';

INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
)
VALUES (
  'TEST_DEVICE_001',
  'critical_battery',
  'critical',
  'Critical Battery (AI Chat Disabled)',
  'Battery dropped to 5%. This should not create a chat message.'
);

-- Check results:
SELECT 
  'TEST 3: AI Chat Disabled' as test_name,
  e.id as event_id,
  e.notified,
  COUNT(ch.id) as chat_messages_created
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Critical Battery (AI Chat Disabled)'
GROUP BY e.id, e.notified;

-- Re-enable AI chat for next tests
UPDATE vehicle_notification_preferences
SET enable_ai_chat_critical_battery = true
WHERE device_id = 'TEST_DEVICE_001';

-- TEST 4: Personality and Language
-- Expected: Message should reflect professional personality and English language
-- Note: After running migration 20260120000005_add_funny_personality_mode.sql, you can change to 'funny'
UPDATE vehicle_llm_settings
SET personality_mode = 'professional',
    language_preference = 'english'
WHERE device_id = 'TEST_DEVICE_001';

INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
)
VALUES (
  'TEST_DEVICE_001',
  'overspeeding',
  'warning',
  'Overspeeding Detected',
  'Vehicle traveling at 120 km/h. Vehicle exceeded speed limit.'
);

-- Check message personality:
SELECT 
  'TEST 4: Personality & Language' as test_name,
  ch.content as chat_message,
  vls.personality_mode,
  vls.language_preference
FROM vehicle_chat_history ch
JOIN vehicle_llm_settings vls ON vls.device_id = ch.device_id
WHERE ch.device_id = 'TEST_DEVICE_001'
  AND ch.is_proactive = true
  AND ch.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY ch.created_at DESC
LIMIT 1;

-- TEST 5: Location Tag
-- Expected: Message should include [LOCATION: ...] tag
-- TEST 5: Location Tag (Note: Basic table schema may not have latitude/longitude columns)
-- Expected: Message should include location info if available
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message
)
VALUES (
  'TEST_DEVICE_001',
  'geofence_exit',
  'warning',
  'Geofence Exit',
  'Vehicle exited geofence boundary at Lagos, Nigeria'
);

-- Check for location tag:
SELECT 
  'TEST 5: Location Tag' as test_name,
  ch.content as chat_message,
  CASE 
    WHEN ch.content LIKE '%[LOCATION:%' THEN '✅ Location tag found'
    ELSE '❌ Location tag missing'
  END as location_check
FROM vehicle_chat_history ch
WHERE ch.device_id = 'TEST_DEVICE_001'
  AND ch.is_proactive = true
  AND ch.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY ch.created_at DESC
LIMIT 1;

-- TEST 6: Different Event Types
-- Test various event types to ensure they work
INSERT INTO proactive_vehicle_events (device_id, event_type, severity, title, message)
VALUES 
  ('TEST_DEVICE_001', 'low_battery', 'warning', 'Low Battery', 'Battery is getting low at 15%'),
  ('TEST_DEVICE_001', 'offline', 'warning', 'Vehicle Offline', 'Vehicle has gone offline. Lost GPS connection.'),
  ('TEST_DEVICE_001', 'online', 'info', 'Vehicle Online', 'Vehicle is back online. GPS connection restored.'),
  ('TEST_DEVICE_001', 'maintenance_due', 'info', 'Maintenance Due', 'Vehicle needs scheduled maintenance.');

-- Check all event types:
SELECT 
  'TEST 6: Multiple Event Types' as test_name,
  e.event_type,
  e.severity,
  e.notified,
  COUNT(ch.id) as chat_messages_created,
  MAX(e.created_at) as latest_event_time
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.created_at > NOW() - INTERVAL '5 minutes'
GROUP BY e.event_type, e.severity, e.notified
ORDER BY MAX(e.created_at) DESC;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Overall Test Results Summary
SELECT 
  'OVERALL TEST RESULTS' as summary,
  COUNT(DISTINCT e.id) as total_events_created,
  COUNT(DISTINCT e.id) FILTER (WHERE e.notified = true) as events_notified,
  COUNT(DISTINCT ch.id) as total_chat_messages_created,
  COUNT(DISTINCT ch.id) FILTER (WHERE ch.is_proactive = true) as proactive_messages,
  AVG(EXTRACT(EPOCH FROM (e.notified_at - e.created_at))) as avg_processing_time_seconds
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.created_at > NOW() - INTERVAL '1 hour';

-- Check for errors (if error logging table exists)
-- SELECT 
--   'ERROR SUMMARY' as summary,
--   COUNT(*) as total_errors,
--   function_name,
--   COUNT(*) as error_count
-- FROM edge_function_errors
-- WHERE function_name = 'proactive-alarm-to-chat'
--   AND created_at > NOW() - INTERVAL '1 hour'
-- GROUP BY function_name;

-- Check chat messages for test vehicle
SELECT 
  'CHAT MESSAGES' as summary,
  ch.id,
  ch.role,
  ch.is_proactive,
  ch.content,
  ch.created_at,
  e.event_type,
  e.severity
FROM vehicle_chat_history ch
LEFT JOIN proactive_vehicle_events e ON e.id = ch.alert_id
WHERE ch.device_id = 'TEST_DEVICE_001'
  AND ch.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ch.created_at DESC;

-- ============================================
-- CLEANUP (Optional - Comment out to keep test data)
-- ============================================

-- Uncomment to clean up test data:
-- DELETE FROM vehicle_chat_history WHERE device_id = 'TEST_DEVICE_001' AND created_at > NOW() - INTERVAL '1 hour';
-- DELETE FROM proactive_vehicle_events WHERE device_id = 'TEST_DEVICE_001' AND created_at > NOW() - INTERVAL '1 hour';
-- DELETE FROM vehicle_llm_settings WHERE device_id = 'TEST_DEVICE_001';
-- DELETE FROM vehicle_notification_preferences WHERE device_id = 'TEST_DEVICE_001';
-- DELETE FROM vehicle_assignments WHERE device_id = 'TEST_DEVICE_001';
-- DELETE FROM vehicles WHERE device_id = 'TEST_DEVICE_001';
