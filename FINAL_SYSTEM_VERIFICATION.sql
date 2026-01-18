-- Final System Verification
-- Test the complete proactive-alarm-to-chat system

-- ============================================
-- STEP 1: Verify Schema
-- ============================================
SELECT 
  'SCHEMA VERIFICATION' as status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified')
    THEN '✅ notified column EXISTS'
    ELSE '❌ notified column MISSING'
  END as notified_column,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proactive_vehicle_events' AND column_name = 'notified_at')
    THEN '✅ notified_at column EXISTS'
    ELSE '❌ notified_at column MISSING'
  END as notified_at_column;

-- ============================================
-- STEP 2: Check Current System Status
-- ============================================
SELECT 
  'CURRENT STATUS' as status,
  COUNT(*) FILTER (WHERE is_proactive = true) as proactive_chat_messages,
  COUNT(*) FILTER (WHERE is_proactive = true AND created_at > NOW() - INTERVAL '1 hour') as recent_messages,
  MAX(created_at) FILTER (WHERE is_proactive = true) as last_message_time
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001';

-- ============================================
-- STEP 3: Create Final Test Event
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
  'Final System Verification Test',
  'Testing complete system after all fixes',
  jsonb_build_object('test', true, 'final_verification', true)
)
RETURNING 
  id as event_id,
  created_at,
  notified,
  'Event created - waiting for processing...' as status;

-- ============================================
-- STEP 4: Wait and Check Results (Run after 5-10 seconds)
-- ============================================
-- After waiting 5-10 seconds, run this query:

SELECT 
  'FINAL TEST RESULTS' as status,
  e.id as event_id,
  e.title,
  e.notified as is_notified,
  e.notified_at,
  CASE 
    WHEN e.notified = true THEN '✅ Event was notified!'
    WHEN e.notified IS NULL THEN '⚠️ notified column may not exist'
    ELSE '❌ Event not notified - check edge function logs'
  END as notification_status,
  COUNT(ch.id) as chat_messages_created,
  CASE 
    WHEN COUNT(ch.id) > 0 THEN '✅ Chat message created!'
    ELSE '❌ No chat message created'
  END as chat_status,
  MAX(ch.content) as chat_message_preview,
  EXTRACT(EPOCH FROM (NOW() - e.created_at))::INTEGER as seconds_since_creation
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.title = 'Final System Verification Test'
GROUP BY e.id, e.title, e.notified, e.notified_at, e.created_at
ORDER BY e.created_at DESC
LIMIT 1;

-- ============================================
-- STEP 5: Overall System Health Check
-- ============================================
SELECT 
  'SYSTEM HEALTH' as status,
  COUNT(DISTINCT e.id) as total_events_last_hour,
  COUNT(DISTINCT e.id) FILTER (WHERE e.notified = true) as notified_events,
  COUNT(DISTINCT ch.id) FILTER (WHERE ch.is_proactive = true) as proactive_messages,
  CASE 
    WHEN COUNT(DISTINCT ch.id) FILTER (WHERE ch.is_proactive = true) > 0 
    THEN '✅ System is working!'
    ELSE '❌ System may not be working'
  END as system_status
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- CONCLUSION
-- ============================================
-- If chat_messages_created > 0: ✅ System is working!
-- If notified = true: ✅ Complete tracking working!
-- If notified = false but chat_messages_created > 0: ⚠️ Tracking issue only
--
-- The system is production-ready if chat messages are being created!
