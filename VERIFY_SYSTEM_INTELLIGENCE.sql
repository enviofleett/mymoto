-- ============================================
-- System Intelligence & Proactivity Verification
-- Run this to verify all components are set up correctly
-- ============================================

-- 1. Check Database Tables Exist
DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  tbl TEXT;
  required_tables TEXT[] := ARRAY[
    'proactive_vehicle_events',
    'vehicle_assignments',
    'profiles',
    'ai_training_scenarios',
    'vehicle_llm_settings',
    'vehicle_chat_history'
  ];
BEGIN
  FOREACH tbl IN ARRAY required_tables
  LOOP
    IF NOT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = tbl
    ) THEN
      missing_tables := array_append(missing_tables, tbl);
    END IF;
  END LOOP;

  IF array_length(missing_tables, 1) > 0 THEN
    RAISE WARNING 'Missing tables: %', array_to_string(missing_tables, ', ');
  ELSE
    RAISE NOTICE '✅ All required tables exist';
  END IF;
END $$;

-- 2. Check Required Columns in vehicle_chat_history
DO $$
DECLARE
  missing_cols TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
  required_cols TEXT[] := ARRAY['is_proactive', 'alert_id'];
BEGIN
  FOREACH col IN ARRAY required_cols
  LOOP
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'vehicle_chat_history'
      AND column_name = col
    ) THEN
      missing_cols := array_append(missing_cols, col);
    END IF;
  END LOOP;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE WARNING 'Missing columns in vehicle_chat_history: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE '✅ All required columns exist in vehicle_chat_history';
  END IF;
END $$;

-- 3. Check RLS Policies on proactive_vehicle_events
DO $$
DECLARE
  policy_count INTEGER;
  expected_policies TEXT[] := ARRAY[
    'Users can view their vehicle events',
    'Users can acknowledge their vehicle events'
  ];
  found_policies TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'proactive_vehicle_events';

  IF policy_count < 2 THEN
    RAISE WARNING 'Expected 2 RLS policies, found %', policy_count;
  ELSE
    RAISE NOTICE '✅ RLS policies exist on proactive_vehicle_events';
  END IF;
END $$;

-- 4. Check Trigger Exists
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_trigger
    WHERE tgname = 'trigger_alarm_to_chat'
    AND tgrelid = 'public.proactive_vehicle_events'::regclass
  ) THEN
    RAISE NOTICE '✅ Trigger trigger_alarm_to_chat exists';
  ELSE
    RAISE WARNING '❌ Trigger trigger_alarm_to_chat does NOT exist';
  END IF;
END $$;

-- 5. Check Trigger Function Exists
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_proc
    WHERE proname = 'notify_alarm_to_chat'
  ) THEN
    RAISE NOTICE '✅ Function notify_alarm_to_chat exists';
  ELSE
    RAISE WARNING '❌ Function notify_alarm_to_chat does NOT exist';
  END IF;
END $$;

-- 6. Check Vehicle Assignments
DO $$
DECLARE
  assignment_count INTEGER;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO assignment_count FROM vehicle_assignments;
  SELECT COUNT(*) INTO profile_count FROM profiles;
  
  RAISE NOTICE '📊 Profiles: %, Vehicle Assignments: %', profile_count, assignment_count;
  
  IF assignment_count = 0 THEN
    RAISE WARNING '⚠️  No vehicle assignments found. Users will not see any alarms.';
  ELSE
    RAISE NOTICE '✅ Vehicle assignments exist';
  END IF;
END $$;

-- 7. Check AI Training Scenarios
DO $$
DECLARE
  scenario_count INTEGER;
  active_count INTEGER;
  table_exists BOOLEAN;
BEGIN
  -- Check if table exists first
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ai_training_scenarios'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RAISE WARNING '❌ ai_training_scenarios table does NOT exist. Run migration: supabase/migrations/20260114000006_create_ai_training_scenarios.sql';
    RETURN;
  END IF;
  
  SELECT COUNT(*) INTO scenario_count FROM ai_training_scenarios;
  SELECT COUNT(*) INTO active_count FROM ai_training_scenarios WHERE is_active = true;
  
  RAISE NOTICE '📊 Total Scenarios: %, Active: %', scenario_count, active_count;
  
  IF active_count = 0 THEN
    RAISE WARNING '⚠️  No active AI training scenarios. AI will not use custom guidance.';
  ELSE
    RAISE NOTICE '✅ Active AI training scenarios exist';
  END IF;
END $$;

-- 8. Check Vehicle LLM Settings
DO $$
DECLARE
  setting_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO setting_count FROM vehicle_llm_settings;
  
  RAISE NOTICE '📊 Vehicles with LLM Settings: %', setting_count;
  
  IF setting_count = 0 THEN
    RAISE WARNING '⚠️  No vehicles have LLM settings configured. Default values will be used.';
  ELSE
    RAISE NOTICE '✅ Vehicle LLM settings exist';
  END IF;
END $$;

-- 9. Check Recent Proactive Events
DO $$
DECLARE
  event_count INTEGER;
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO event_count FROM proactive_vehicle_events;
  SELECT COUNT(*) INTO recent_count 
  FROM proactive_vehicle_events 
  WHERE created_at > now() - interval '24 hours';
  
  RAISE NOTICE '📊 Total Events: %, Events (24h): %', event_count, recent_count;
END $$;

-- 10. Check Recent Proactive Chat Messages
DO $$
DECLARE
  proactive_count INTEGER;
  recent_proactive INTEGER;
  recent_event_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO proactive_count 
  FROM vehicle_chat_history 
  WHERE is_proactive = true;
  
  SELECT COUNT(*) INTO recent_proactive
  FROM vehicle_chat_history
  WHERE is_proactive = true
  AND created_at > now() - interval '24 hours';
  
  SELECT COUNT(*) INTO recent_event_count
  FROM proactive_vehicle_events
  WHERE created_at > now() - interval '24 hours';
  
  RAISE NOTICE '📊 Total Proactive Messages: %, Messages (24h): %', proactive_count, recent_proactive;
  
  IF proactive_count = 0 AND recent_event_count > 0 THEN
    RAISE WARNING '⚠️  Events exist but no proactive chat messages found. Check edge function logs.';
  ELSIF proactive_count > 0 THEN
    RAISE NOTICE '✅ Proactive chat messages are being created';
  END IF;
END $$;

-- Summary
SELECT 
  '✅ SYSTEM VERIFICATION COMPLETE' as status,
  'Check the NOTICE messages above for detailed results' as note,
  '⚠️  Review any WARNING messages - they indicate potential issues' as warning;
