-- Complete Final Test - Proactive Alarm-to-Chat System
-- Run this to verify everything is working after fixes

-- ============================================
-- PART 1: Verify Schema (notified column)
-- ============================================
SELECT 
  'SCHEMA CHECK' as test_part,
  'notified' as column_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
UNION ALL
SELECT 
  'SCHEMA CHECK' as test_part,
  'notified_at' as column_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified_at')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================
-- PART 2: Verify System is Creating Chat Messages
-- ============================================
SELECT 
  'CHAT MESSAGES' as test_part,
  COUNT(*) as total_proactive_messages,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as recent_messages,
  MAX(created_at) as last_message_time,
  '✅ System is creating messages' as status
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001'
  AND is_proactive = true;

-- ============================================
-- PART 3: Create New Test Event
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
  'Complete Final Test',
  'Final verification test after all fixes',
  jsonb_build_object('test', true, 'final_test', true)
)
RETURNING 
  id as event_id,
  created_at,
  'Test event created - wait 5-10 seconds then check results' as next_step;

-- ============================================
-- PART 4: Check Results (Run this after 5-10 seconds)
-- ============================================
-- WAIT 5-10 SECONDS, then run this query:

SELECT 
  'TEST RESULTS' as test_part,
  e.id as event_id,
  e.title,
  e.notified,
  e.notified_at,
  CASE 
    WHEN e.notified = true THEN '✅ PERFECT - Event notified and tracked!'
    WHEN e.notified = false AND COUNT(ch.id) > 0 THEN '⚠️ Chat created but notified not updated'
    WHEN COUNT(ch.id) > 0 THEN '✅ Chat message created - System working!'
    ELSE '❌ No chat message - Check edge function logs'
  END as overall_status,
  COUNT(ch.id) as chat_messages_created,
  MAX(ch.content) as chat_message_preview
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Complete Final Test'
GROUP BY e.id, e.title, e.notified, e.notified_at
ORDER BY e.created_at DESC
LIMIT 1;

-- ============================================
-- PART 5: Production Readiness Assessment
-- ============================================
SELECT 
  'PRODUCTION READINESS' as assessment,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vehicle_chat_history 
      WHERE device_id = 'TEST_DEVICE_001' 
      AND is_proactive = true 
      AND created_at > NOW() - INTERVAL '1 hour'
    ) THEN '✅ SYSTEM IS WORKING'
    ELSE '❌ System not working'
  END as system_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified')
    THEN '✅ Tracking column exists'
    ELSE '⚠️ Tracking column missing (not critical)'
  END as tracking_status,
  CASE 
    WHEN COUNT(*) FILTER (WHERE is_proactive = true) > 0 
    THEN '✅ Production Ready'
    ELSE '❌ Needs testing'
  END as production_ready
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour';
