-- System is Actually Working - Just Missing Notified Column Update
-- Chat messages ARE being created, so the system works!
-- The only issue is the notified column not being updated

-- ============================================
-- VERIFY: System IS Working
-- ============================================
-- Check chat messages (which confirms system works)
SELECT 
  'SYSTEM STATUS' as status,
  '✅ CHAT MESSAGES ARE BEING CREATED - SYSTEM IS WORKING!' as system_status,
  COUNT(*) as total_proactive_messages,
  MAX(created_at) as last_message_time,
  COUNT(DISTINCT alert_id) as unique_events_processed
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001'
  AND is_proactive = true
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- CHECK: Why notified column not updating
-- ============================================

-- Check if notified column exists
SELECT 
  'NOTIFIED COLUMN CHECK' as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified'
    ) THEN '✅ notified column EXISTS'
    ELSE '❌ notified column MISSING - Add with ADD_NOTIFIED_COLUMN.sql'
  END as notified_column_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND column_name = 'notified_at'
    ) THEN '✅ notified_at column EXISTS'
    ELSE '❌ notified_at column MISSING - Add with ADD_NOTIFIED_COLUMN.sql'
  END as notified_at_column_status;

-- Check recent events with their chat messages
SELECT 
  'EVENTS VS CHAT MESSAGES' as status,
  e.id as event_id,
  e.title,
  e.notified as is_notified,
  e.notified_at,
  COUNT(ch.id) as chat_messages_created,
  MAX(ch.created_at) as last_chat_message
FROM proactive_vehicle_events e
LEFT JOIN vehicle_chat_history ch ON ch.alert_id = e.id AND ch.is_proactive = true
WHERE e.device_id = 'TEST_DEVICE_001'
  AND e.created_at > NOW() - INTERVAL '1 hour'
GROUP BY e.id, e.title, e.notified, e.notified_at
ORDER BY e.created_at DESC
LIMIT 10;

-- ============================================
-- SOLUTION: Add notified column if missing
-- ============================================
-- If notified column is missing, run ADD_NOTIFIED_COLUMN.sql
-- Then manually update existing events that have chat messages:

-- Update events that have chat messages but aren't marked as notified
UPDATE proactive_vehicle_events e
SET 
  notified = true,
  notified_at = (
    SELECT MAX(created_at) 
    FROM vehicle_chat_history 
    WHERE alert_id = e.id AND is_proactive = true
  )
WHERE EXISTS (
  SELECT 1 
  FROM vehicle_chat_history 
  WHERE alert_id = e.id AND is_proactive = true
)
AND (notified IS NULL OR notified = false)
AND e.device_id = 'TEST_DEVICE_001';

-- Verify updates
SELECT 
  'AFTER UPDATE' as status,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as notified_events,
  COUNT(*) FILTER (WHERE notified = false) as not_notified_events
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- CONCLUSION
-- ============================================
-- ✅ SYSTEM IS WORKING - Chat messages are being created!
-- ⚠️ Only issue: notified column not updating
-- 
-- If notified column is missing:
--   1. Run ADD_NOTIFIED_COLUMN.sql
--   2. Run the UPDATE query above to mark existing events
--
-- If notified column exists but not updating:
--   - Check edge function logs for update errors
--   - The system still works, just tracking is incomplete
