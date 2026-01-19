-- Quick Test Script for AI Chat Preferences
-- Use this to quickly test the implementation

-- TEST 1: Setup test scenario - AI Chat Disabled, Push Enabled
-- Replace YOUR_DEVICE_ID and YOUR_USER_ID with actual values
UPDATE vehicle_notification_preferences
SET 
  ignition_on = true,                -- Push enabled
  enable_ai_chat_ignition_on = false -- AI Chat disabled
WHERE device_id = '13612333441'  -- Replace with your device_id
  AND user_id = '4efdccee-be74-4087-b30f-9d5dc8577677';  -- Replace with your user_id

-- Verify the update
SELECT 
  device_id,
  ignition_on as push_enabled,
  enable_ai_chat_ignition_on as ai_chat_enabled
FROM vehicle_notification_preferences
WHERE device_id = '13612333441';

-- TEST 2: Create a test event (will trigger proactive-alarm-to-chat)
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  metadata,
  created_at
) VALUES (
  '13612333441',
  'ignition_on',
  'info',
  'Test: Ignition Started',
  'This is a test event to verify AI chat preferences',
  jsonb_build_object('test', true, 'timestamp', now()),
  now()
)
RETURNING id, device_id, event_type, created_at;

-- TEST 3: Check if AI chat message was created (should be 0 if AI chat is disabled)
-- Wait a few seconds after creating the event, then run:
SELECT 
  id,
  device_id,
  user_id,
  role,
  substring(content, 1, 100) as content_preview,
  is_proactive,
  created_at
FROM vehicle_chat_history
WHERE device_id = '13612333441'
  AND is_proactive = true
  AND created_at > now() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- TEST 4: Switch - Enable AI Chat, Disable Push
UPDATE vehicle_notification_preferences
SET 
  ignition_on = false,               -- Push disabled
  enable_ai_chat_ignition_on = true  -- AI Chat enabled
WHERE device_id = '13612333441'
  AND user_id = '4efdccee-be74-4087-b30f-9d5dc8577677';

-- Create another test event
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  metadata
) VALUES (
  '13612333441',
  'ignition_on',
  'info',
  'Test: Ignition Started (AI Chat Enabled)',
  'This event should create an AI chat message',
  jsonb_build_object('test', true)
)
RETURNING id;

-- Check again (should have 1+ rows now)
SELECT 
  COUNT(*) as ai_chat_messages_created
FROM vehicle_chat_history
WHERE device_id = '13612333441'
  AND is_proactive = true
  AND role = 'assistant'
  AND created_at > now() - INTERVAL '5 minutes';
