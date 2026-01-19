-- =====================================================
-- BASIC TEST: Retry System (No notified column required)
-- This version works even if notified column doesn't exist
-- =====================================================

-- STEP 1: Create a test proactive event
DO $$
DECLARE
  test_device_id TEXT;
  test_event_id UUID;
BEGIN
  -- Get first available device ID
  SELECT device_id INTO test_device_id 
  FROM vehicles 
  LIMIT 1;
  
  IF test_device_id IS NULL THEN
    RAISE NOTICE '❌ No vehicles found. Please add a vehicle first.';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Using device: %', test_device_id;
  
  -- Create test event
  INSERT INTO proactive_vehicle_events (
    device_id,
    event_type,
    severity,
    title,
    message,
    metadata
  ) VALUES (
    test_device_id,
    'low_battery',
    'warning',
    'Test: Battery Low',
    'This is a test notification to verify the retry system',
    jsonb_build_object('test', true, 'created_at', now())
  )
  RETURNING id INTO test_event_id;
  
  RAISE NOTICE '✅ Test event created with ID: %', test_event_id;
  RAISE NOTICE '⏳ Waiting 5 seconds for notification to process...';
  
  -- Wait for the trigger to fire
  PERFORM pg_sleep(5);
  
  RAISE NOTICE '';
  RAISE NOTICE '=== CHECKING NOTIFICATION STATUS ===';
END $$;

-- STEP 2: Check if notification was created (by checking chat messages)
SELECT 
  '=== NOTIFICATION STATUS ===' as check_section;

SELECT 
  e.id as event_id,
  e.device_id,
  e.event_type,
  e.title,
  e.created_at,
  (SELECT COUNT(*) FROM vehicle_chat_history WHERE alert_id = e.id AND is_proactive = true) as chat_messages_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM vehicle_chat_history WHERE alert_id = e.id AND is_proactive = true) > 0 
    THEN '✅ NOTIFIED (chat message created)'
    ELSE '⏳ PENDING (no chat message yet)'
  END as notification_status
FROM proactive_vehicle_events e
WHERE e.metadata->>'test' = 'true'
ORDER BY e.created_at DESC
LIMIT 1;

-- STEP 3: Check if chat message was created
SELECT 
  '=== CHAT MESSAGE STATUS ===' as check_section;

SELECT 
  id,
  device_id,
  role,
  LEFT(content, 100) as content_preview,
  is_proactive,
  alert_id,
  created_at,
  CASE 
    WHEN is_proactive = true THEN '✅ PROACTIVE MESSAGE CREATED'
    ELSE '❌ NOT A PROACTIVE MESSAGE'
  END as status
FROM vehicle_chat_history
WHERE is_proactive = true
  AND alert_id IN (
    SELECT id FROM proactive_vehicle_events 
    WHERE metadata->>'test' = 'true'
  )
ORDER BY created_at DESC
LIMIT 1;

-- STEP 4: Check for any errors
SELECT 
  '=== ERROR LOG STATUS ===' as check_section;

SELECT 
  id,
  function_name,
  event_id,
  LEFT(error_message, 80) as error_preview,
  retry_count,
  resolved,
  created_at,
  CASE 
    WHEN resolved = true THEN '✅ RESOLVED'
    WHEN retry_count >= 3 THEN '❌ MAX RETRIES'
    ELSE '⏳ PENDING RETRY'
  END as status
FROM edge_function_errors
WHERE event_id IN (
  SELECT id FROM proactive_vehicle_events 
  WHERE metadata->>'test' = 'true'
)
ORDER BY created_at DESC;

-- STEP 5: Summary
SELECT 
  '=== TEST SUMMARY ===' as summary_section,
  (SELECT COUNT(*) FROM proactive_vehicle_events WHERE metadata->>'test' = 'true') as test_events_created,
  (SELECT COUNT(*) FROM vehicle_chat_history WHERE is_proactive = true AND alert_id IN (SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true')) as chat_messages_created,
  (SELECT COUNT(*) FROM edge_function_errors WHERE event_id IN (SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true')) as errors_logged,
  CASE 
    WHEN (SELECT COUNT(*) FROM vehicle_chat_history WHERE is_proactive = true AND alert_id IN (SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true')) > 0
    THEN '✅ TEST PASSED - Notification system working (chat message created)'
    WHEN (SELECT COUNT(*) FROM edge_function_errors WHERE event_id IN (SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true')) > 0
    THEN '⚠️ TEST PARTIAL - Errors logged, check retry system'
    ELSE '❌ TEST FAILED - Check edge function logs'
  END as test_result;

-- STEP 6: Check table columns (diagnostic)
SELECT 
  '=== TABLE COLUMNS CHECK ===' as diagnostic_section;

-- Check if notified columns exist
SELECT 
  'notified column' as column_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND table_schema = 'public'
      AND column_name = 'notified'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run ADD_NOTIFIED_COLUMNS.sql'
  END as status
UNION ALL
SELECT 
  'notified_at column',
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'proactive_vehicle_events' 
      AND table_schema = 'public'
      AND column_name = 'notified_at'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Run ADD_NOTIFIED_COLUMNS.sql'
  END;

-- STEP 7: Cleanup (Optional - uncomment to remove test data)
/*
DELETE FROM vehicle_chat_history 
WHERE alert_id IN (
  SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true'
);

DELETE FROM edge_function_errors 
WHERE event_id IN (
  SELECT id FROM proactive_vehicle_events WHERE metadata->>'test' = 'true'
);

DELETE FROM proactive_vehicle_events 
WHERE metadata->>'test' = 'true';
*/
