-- Diagnostic Queries for Proactive Alarm-to-Chat System
-- Run these to identify why events aren't being processed

-- ============================================
-- 1. CHECK TRIGGER EXISTS
-- ============================================
SELECT 
  'TRIGGER CHECK' as diagnostic,
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgenabled as is_enabled,
  pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'trigger_alarm_to_chat'
  AND tgrelid = 'proactive_vehicle_events'::regclass;

-- ============================================
-- 2. CHECK FUNCTION EXISTS
-- ============================================
SELECT 
  'FUNCTION CHECK' as diagnostic,
  proname as function_name,
  prosrc as function_source
FROM pg_proc
WHERE proname = 'notify_alarm_to_chat';

-- ============================================
-- 3. CHECK TEST EVENTS
-- ============================================
SELECT 
  'TEST EVENTS' as diagnostic,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE notified = true) as notified_events,
  COUNT(*) FILTER (WHERE notified = false) as pending_events,
  MIN(created_at) as first_event,
  MAX(created_at) as last_event
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- 4. CHECK VEHICLE ASSIGNMENTS
-- ============================================
SELECT 
  'VEHICLE ASSIGNMENTS' as diagnostic,
  va.device_id,
  COUNT(DISTINCT va.profile_id) as assigned_profiles,
  COUNT(DISTINCT p.user_id) as assigned_users
FROM vehicle_assignments va
LEFT JOIN profiles p ON p.id = va.profile_id
WHERE va.device_id = 'TEST_DEVICE_001'
GROUP BY va.device_id;

-- ============================================
-- 5. CHECK AI CHAT PREFERENCES
-- ============================================
SELECT 
  'AI CHAT PREFERENCES' as diagnostic,
  vnp.device_id,
  vnp.user_id,
  vnp.enable_ai_chat_critical_battery,
  vnp.enable_ai_chat_offline,
  vnp.enable_ai_chat_low_battery
FROM vehicle_notification_preferences vnp
WHERE vnp.device_id = 'TEST_DEVICE_001';

-- ============================================
-- 6. CHECK IF VEHICLE EXISTS
-- ============================================
SELECT 
  'VEHICLE CHECK' as diagnostic,
  device_id,
  device_name,
  created_at
FROM vehicles
WHERE device_id = 'TEST_DEVICE_001';

-- ============================================
-- 7. CHECK NOTIFIED COLUMN EXISTS
-- ============================================
SELECT 
  'SCHEMA CHECK' as diagnostic,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'proactive_vehicle_events'
  AND column_name IN ('notified', 'notified_at', 'message', 'description')
ORDER BY column_name;

-- ============================================
-- 8. CHECK CHAT MESSAGES CREATED
-- ============================================
SELECT 
  'CHAT MESSAGES' as diagnostic,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE is_proactive = true) as proactive_messages,
  COUNT(*) FILTER (WHERE alert_id IS NOT NULL) as messages_with_alert_id
FROM vehicle_chat_history
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- 9. RECENT EVENTS DETAIL
-- ============================================
SELECT 
  'RECENT EVENTS DETAIL' as diagnostic,
  id,
  device_id,
  event_type,
  severity,
  title,
  notified,
  notified_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))::INTEGER as seconds_ago
FROM proactive_vehicle_events
WHERE device_id = 'TEST_DEVICE_001'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- 10. TRIGGER CONFIGURATION (if settings exist)
-- ============================================
-- Check if app.settings configuration exists
-- Note: This may not work if settings aren't configured
SELECT 
  'TRIGGER CONFIG' as diagnostic,
  current_setting('app.settings.supabase_url', true) as supabase_url_configured,
  CASE 
    WHEN current_setting('app.settings.supabase_service_role_key', true) IS NOT NULL 
    THEN 'Configured (hidden)'
    ELSE 'Not configured'
  END as service_key_status;

-- ============================================
-- COMMON ISSUES & SOLUTIONS
-- ============================================
-- Issue 1: Trigger not configured
-- Solution: Run migration 20260114000004_trigger_alarm_to_chat.sql
--
-- Issue 2: Settings not configured (supabase_url, service_role_key)
-- Solution: Set app.settings or use app_settings table method
--
-- Issue 3: No vehicle assignments
-- Solution: Create vehicle_assignments for TEST_DEVICE_001
--
-- Issue 4: AI Chat preferences disabled
-- Solution: Set enable_ai_chat_* = true for test events
--
-- Issue 5: Edge function not deployed
-- Solution: Run: supabase functions deploy proactive-alarm-to-chat
--
-- Issue 6: Edge function errors
-- Solution: Check edge function logs in Supabase Dashboard
