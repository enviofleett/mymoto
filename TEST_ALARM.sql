-- Test Alarm for Device: 358657105967694
-- This will trigger the webhook and create a proactive chat message

INSERT INTO proactive_vehicle_events (
  device_id, 
  event_type, 
  severity, 
  title, 
  message, 
  metadata
)
VALUES (
  '358657105967694',
  'test',
  'warning',
  'Test Alarm',
  'This is a test alarm to verify the webhook and proactive chat integration',
  '{}'::jsonb
);

-- After running this, check:
-- 1. Webhook delivery: Dashboard → Database → Webhooks → alarm-to-chat-webhook → Recent deliveries
-- 2. Edge function logs: Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
-- 3. Chat message: Go to /owner/chat/358657105967694 and verify the AI message appears
