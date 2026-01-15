-- ============================================
-- TEST PROACTIVE ALARM SYSTEM
-- ============================================
-- This script tests the complete proactive alarm flow:
-- 1. Inserts a test alarm
-- 2. Waits for webhook processing
-- 3. Checks if chat message was created
-- 4. Verifies message content

-- Step 1: Insert Test Alarm
INSERT INTO proactive_vehicle_events (
  device_id,
  event_type,
  severity,
  title,
  message,
  description,
  metadata
)
VALUES (
  '358657105967694',
  'test',
  'warning',
  'Gemini API Test - ' || to_char(now(), 'HH24:MI:SS'),
  'Testing the new Gemini API integration',
  'This test verifies that the proactive-alarm-to-chat function is working correctly with the inlined Gemini client.',
  jsonb_build_object(
    'test_type', 'gemini_integration',
    'timestamp', now(),
    'expected_action', 'generate_proactive_chat_message'
  )
);

-- Step 2: Wait 10 seconds for webhook and edge function to process
-- (Run the SELECT queries below after waiting)

-- ============================================
-- CHECK RESULTS (Run these after 10 seconds)
-- ============================================

-- Check if chat message was created
SELECT 
  'Chat Message Check' as test,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - Message created'
    ELSE '❌ FAIL - No message found'
  END as result,
  COUNT(*) as message_count,
  MAX(created_at) as latest_message_time
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true
  AND created_at > now() - interval '2 minutes';

-- Display the actual message content
SELECT 
  'Message Content' as test,
  content,
  role,
  is_proactive,
  alert_id,
  created_at
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true
  AND created_at > now() - interval '2 minutes'
ORDER BY created_at DESC
LIMIT 1;

-- Check message quality (LLM-generated vs fallback)
SELECT 
  'Message Quality Check' as test,
  CASE 
    WHEN content LIKE '%Test - Gemini%' OR content LIKE '%Testing the new Gemini%' THEN 
      '⚠️  FALLBACK - Message appears to be fallback format. Check if GEMINI_API_KEY is set or if API call failed.'
    WHEN LENGTH(content) > 50 AND content NOT LIKE event.title || '%' THEN 
      '✅ LLM-GENERATED - Message appears to be AI-generated with personality'
    ELSE 
      '⚠️  UNCLEAR - Review message content manually'
  END as quality_check,
  LENGTH(content) as message_length,
  CASE 
    WHEN content LIKE '%⚡%' THEN 'Has emoji'
    ELSE 'No emoji'
  END as has_emoji
FROM vehicle_chat_history vch
LEFT JOIN proactive_vehicle_events pve ON vch.alert_id = pve.id
WHERE vch.device_id = '358657105967694'
  AND vch.is_proactive = true
  AND vch.created_at > now() - interval '2 minutes'
ORDER BY vch.created_at DESC
LIMIT 1;

-- Check recent alarms
SELECT 
  'Recent Alarms' as info,
  id,
  event_type,
  severity,
  title,
  created_at
FROM proactive_vehicle_events
WHERE device_id = '358657105967694'
  AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;

-- ============================================
-- MANUAL CHECKS
-- ============================================
-- 1. Edge Function Logs:
--    Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
--    Look for:
--      ✅ "[Gemini Client] Calling Gemini API directly" = Gemini API is being used
--      ⚠️  "[Gemini Client] Using Lovable AI Gateway (fallback)" = Using fallback (GEMINI_API_KEY not set)
--      ✅ "[Gemini Client] Successfully received response" = API call succeeded
--      ❌ "[Gemini Client] API error response" = Check error details
--
-- 2. Verify Secret:
--    Dashboard → Edge Functions → Secrets
--    Should see: GEMINI_API_KEY ✅
--
-- 3. Check Webhook:
--    Dashboard → Database → Webhooks → alarm-to-chat-webhook → Recent deliveries
--    Should show successful delivery ✅
