-- Quick Test: Insert alarm and check for chat message
-- Run this, wait 10 seconds, then run the SELECT query below

-- INSERT TEST ALARM
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  '358657105967694',
  'test',
  'warning',
  'Quick Test - ' || to_char(now(), 'HH24:MI:SS'),
  'Quick deployment verification',
  '{}'::jsonb
);

-- Wait 10 seconds, then run this query:
-- SELECT * FROM vehicle_chat_history 
-- WHERE device_id = '358657105967694' 
--   AND is_proactive = true 
--   AND created_at > now() - interval '2 minutes'
-- ORDER BY created_at DESC 
-- LIMIT 1;
