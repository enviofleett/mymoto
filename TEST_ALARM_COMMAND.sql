-- ============================================
-- TEST ALARM COMMAND
-- ============================================
-- Copy and paste this into Supabase SQL Editor to test the proactive alarm system
-- This will trigger the webhook and create a chat message

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
  'Test Alarm - System Verification',
  'This is a test alarm to verify the complete proactive alarm system. The webhook should trigger, the edge function should generate an LLM message, and it should appear in the vehicle chat.',
  '{"source": "manual_test", "test_type": "system_verification"}'::jsonb
);

-- ============================================
-- After running this, check:
-- ============================================
-- 1. Webhook delivery: Dashboard → Database → Webhooks → alarm-to-chat-webhook → Recent deliveries
-- 2. Edge function logs: Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
-- 3. Chat message: Navigate to /owner/chat/358657105967694
