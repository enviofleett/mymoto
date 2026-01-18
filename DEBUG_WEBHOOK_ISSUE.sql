-- Debug Webhook Issue
-- Check all components to identify why events aren't being notified

-- ============================================
-- CHECK 1: Verify Trigger and Function Exist
-- ============================================
SELECT 
  'TRIGGER CHECK' as check_type,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_alarm_to_chat') 
    THEN '✅ Trigger exists'
    ELSE '❌ Trigger missing'
  END as trigger_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_alarm_to_chat') 
    THEN '✅ Function exists'
    ELSE '❌ Function missing'
  END as function_status;

-- ============================================
-- CHECK 2: Check if notified column exists
-- ============================================
SELECT 
  'SCHEMA CHECK' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND column_name IN ('notified', 'notified_at', 'message', 'description')
ORDER BY column_name;

-- ============================================
-- CHECK 3: Check Recent Test Events
-- ============================================
SELECT 
  'RECENT EVENTS' as check_type,
  id,
  device_id,
  event_type,
  title,
  notified,
  notified_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))::INTEGER as seconds_ago
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- CHECK 4: Check Vehicle Assignments
-- ============================================
SELECT 
  'VEHICLE ASSIGNMENTS' as check_type,
  va.device_id,
  COUNT(DISTINCT p.user_id) as assigned_users,
  STRING_AGG(DISTINCT u.email, ', ') as user_emails
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE va.device_id = 'TEST_DEVICE_001'
GROUP BY va.device_id;

-- ============================================
-- CHECK 5: Check AI Chat Preferences
-- ============================================
SELECT 
  'AI CHAT PREFERENCES' as check_type,
  device_id,
  user_id,
  enable_ai_chat_critical_battery,
  enable_ai_chat_offline,
  enable_ai_chat_low_battery
FROM vehicle_notification_preferences
WHERE device_id = 'TEST_DEVICE_001';

-- ============================================
-- CHECK 6: Check if Chat Messages Were Created
-- ============================================
SELECT 
  'CHAT MESSAGES' as check_type,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE is_proactive = true) as proactive_messages,
  COUNT(*) FILTER (WHERE alert_id IS NOT NULL) as messages_with_alert_id,
  MAX(created_at) as last_message_time
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- DIAGNOSIS
-- ============================================
-- If notified column doesn't exist:
--   → The edge function cannot update it
--   → Need to add the column
--
-- If webhook is not firing:
--   → Check webhook is configured in Dashboard
--   → Check webhook logs in Dashboard
--
-- If webhook is firing but edge function failing:
--   → Check edge function logs
--   → Check LOVABLE_API_KEY is set
--   → Check edge function deployment
--
-- If edge function working but not marking notified:
--   → Check if notified column exists
--   → Check edge function code for errors
--   → Check vehicle assignments exist
