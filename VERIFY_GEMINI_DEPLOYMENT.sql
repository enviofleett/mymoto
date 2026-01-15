-- ============================================
-- VERIFY GEMINI API DEPLOYMENT
-- ============================================
-- This test verifies that the Gemini API integration is working

-- Step 1: Insert test alarm (triggers webhook → edge function)
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
  'Gemini Deployment Test - ' || to_char(now(), 'HH24:MI:SS'),
  'Testing Gemini API integration',
  'This test verifies that the proactive-alarm-to-chat function is using Gemini API correctly.',
  jsonb_build_object(
    'test_type', 'gemini_verification',
    'timestamp', now()
  )
);

-- Step 2: Wait 10 seconds for processing, then check results
-- (Run the SELECT query below after waiting)

-- ============================================
-- CHECK RESULTS (Run this after 10 seconds)
-- ============================================

-- Check if chat message was created
SELECT 
  'Chat Message Created' as test,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '❌ FAIL - No message found'
  END as result,
  COUNT(*) as message_count,
  MAX(created_at) as latest_message
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true
  AND created_at > now() - interval '2 minutes';

-- Display the actual message
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
  'Message Quality' as test,
  CASE 
    WHEN content LIKE '%Test - Gemini%' OR content LIKE '%Testing Gemini API%' THEN 
      '⚠️  FALLBACK - Message appears to be fallback format. Check if GEMINI_API_KEY is set.'
    WHEN LENGTH(content) > 50 AND content NOT LIKE event.title || '%' THEN 
      '✅ LLM-GENERATED - Message appears to be AI-generated'
    ELSE 
      '⚠️  UNCLEAR - Review message content manually'
  END as quality_check,
  LENGTH(content) as message_length
FROM vehicle_chat_history vch
LEFT JOIN proactive_vehicle_events pve ON vch.alert_id = pve.id
WHERE vch.device_id = '358657105967694'
  AND vch.is_proactive = true
  AND vch.created_at > now() - interval '2 minutes'
ORDER BY vch.created_at DESC
LIMIT 1;

-- ============================================
-- MANUAL CHECKS
-- ============================================
-- 1. Edge Function Logs:
--    Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
--    Look for: "[Gemini Client] Calling Gemini API directly" ✅
--    Or: "[Gemini Client] Using Lovable AI Gateway (fallback)" ⚠️
--
-- 2. Verify Secret:
--    Dashboard → Edge Functions → Secrets
--    Should see: GEMINI_API_KEY ✅
--
-- 3. Check Webhook:
--    Dashboard → Database → Webhooks → alarm-to-chat-webhook → Recent deliveries
--    Should show successful delivery ✅
