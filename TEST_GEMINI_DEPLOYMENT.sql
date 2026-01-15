-- ============================================
-- GEMINI API DEPLOYMENT TEST
-- ============================================
-- This script tests the complete Gemini API integration
-- Run this after deploying the updated edge functions

-- Step 1: Verify Edge Function Secrets
-- (Manual check: Go to Supabase Dashboard → Edge Functions → Secrets)
-- Expected: GEMINI_API_KEY should be set

-- Step 2: Insert Test Alarm
-- This will trigger the proactive-alarm-to-chat function
DO $$
DECLARE
  test_device_id TEXT := '358657105967694';
  test_event_id UUID;
  chat_message_count INT;
BEGIN
  -- Insert test alarm
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
    test_device_id,
    'test',
    'warning',
    'Gemini API Test - ' || to_char(now(), 'HH24:MI:SS'),
    'Testing direct Gemini API integration after deployment',
    'This is a deployment verification test. The edge function should generate a chat message using Gemini API.',
    jsonb_build_object(
      'test_type', 'gemini_deployment',
      'timestamp', now(),
      'expected_action', 'generate_proactive_chat_message'
    )
  )
  RETURNING id INTO test_event_id;

  RAISE NOTICE '✅ Test alarm created with ID: %', test_event_id;
  RAISE NOTICE '⏳ Waiting 5 seconds for edge function to process...';
  
  -- Wait for edge function to process (in production, this happens via webhook)
  PERFORM pg_sleep(5);
  
  -- Step 3: Check if chat message was created
  SELECT COUNT(*) INTO chat_message_count
  FROM vehicle_chat_history
  WHERE device_id = test_device_id
    AND is_proactive = true
    AND alert_id = test_event_id
    AND created_at > now() - interval '1 minute';
  
  IF chat_message_count > 0 THEN
    RAISE NOTICE '✅ SUCCESS: Chat message created! (Count: %)', chat_message_count;
    
    -- Display the created message
    RAISE NOTICE '';
    RAISE NOTICE '📝 Generated Chat Message:';
    FOR rec IN (
      SELECT 
        content,
        role,
        created_at
      FROM vehicle_chat_history
      WHERE device_id = test_device_id
        AND is_proactive = true
        AND alert_id = test_event_id
        AND created_at > now() - interval '1 minute'
      ORDER BY created_at DESC
      LIMIT 1
    ) LOOP
      RAISE NOTICE '   Role: %', rec.role;
      RAISE NOTICE '   Content: %', rec.content;
      RAISE NOTICE '   Created: %', rec.created_at;
    END LOOP;
  ELSE
    RAISE WARNING '⚠️  WARNING: No chat message found. Check edge function logs.';
    RAISE NOTICE '   Expected: A message with is_proactive=true and alert_id=%', test_event_id;
  END IF;
  
  -- Step 4: Verify message quality (not just fallback)
  FOR rec IN (
    SELECT content
    FROM vehicle_chat_history
    WHERE device_id = test_device_id
      AND is_proactive = true
      AND alert_id = test_event_id
      AND created_at > now() - interval '1 minute'
    ORDER BY created_at DESC
    LIMIT 1
  ) LOOP
    -- Check if message looks like LLM-generated (not just title + message)
    IF rec.content LIKE '%Test - Gemini%' OR rec.content LIKE '%Testing direct Gemini API%' THEN
      RAISE WARNING '⚠️  Message appears to be fallback format. Gemini API may not be working.';
      RAISE NOTICE '   Check: 1) GEMINI_API_KEY is set in secrets 2) Edge function logs for errors';
    ELSE
      RAISE NOTICE '✅ Message appears to be LLM-generated (not fallback)';
    END IF;
  END LOOP;
  
END $$;

-- Step 5: Display Summary Report
SELECT 
  '=== DEPLOYMENT TEST SUMMARY ===' as report;

SELECT 
  'Test Alarm' as component,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM proactive_vehicle_events
WHERE device_id = '358657105967694'
  AND event_type = 'test'
  AND created_at > now() - interval '5 minutes';

SELECT 
  'Proactive Chat Messages' as component,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true
  AND created_at > now() - interval '5 minutes';

-- Step 6: Check Edge Function Logs (Manual)
-- Go to: Supabase Dashboard → Edge Functions → proactive-alarm-to-chat → Logs
-- Look for:
--   ✅ "[proactive-alarm-to-chat] Calling Gemini API via shared client"
--   ✅ "[Gemini Client] Calling Gemini API directly" (if GEMINI_API_KEY is set)
--   ⚠️  "[Gemini Client] Using Lovable AI Gateway (fallback)" (if GEMINI_API_KEY not set)
--   ❌ Any error messages

-- Step 7: Verify All Functions Are Updated
-- Check that these functions use the shared client:
--   ✅ proactive-alarm-to-chat
--   ✅ vehicle-chat
--   ✅ fleet-insights
--   ✅ analyze-completed-trip
--   ✅ conversation-manager (via vehicle-chat)

SELECT 
  '=== NEXT STEPS ===' as instructions;

SELECT 
  '1. Check Edge Function Logs' as step,
  'Supabase Dashboard → Edge Functions → proactive-alarm-to-chat → Logs' as action;

SELECT 
  '2. Verify GEMINI_API_KEY' as step,
  'Edge Functions → Secrets → Should see GEMINI_API_KEY' as action;

SELECT 
  '3. Test Vehicle Chat' as step,
  'Open PWA → Navigate to vehicle chat → Send a message' as action;

SELECT 
  '4. Monitor Costs' as step,
  'Google Cloud Console → API & Services → Dashboard' as action;
