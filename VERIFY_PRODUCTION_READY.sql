-- ============================================================================
-- PRODUCTION READINESS VERIFICATION SCRIPT
-- Run this in Supabase SQL Editor to check if system is ready for live
-- ============================================================================

-- ============================================================================
-- CHECK 1: Database Functions (Required)
-- ============================================================================
SELECT 
  'CHECK 1: Database Functions' as check_name,
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ PASS - All functions exist'
    ELSE '❌ FAIL - Missing functions: ' || (3 - COUNT(*))::text
  END as status,
  COUNT(*) as found_count,
  3 as required_count,
  string_agg(routine_name, ', ') as functions_found
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain');

-- ============================================================================
-- CHECK 2: Alert Dismissals Table (Required)
-- ============================================================================
SELECT 
  'CHECK 2: Alert Dismissals Table' as check_name,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ PASS - Table exists'
    ELSE '❌ FAIL - Table missing'
  END as status,
  COUNT(*) as found_count,
  1 as required_count,
  '' as details
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name = 'alert_dismissals';

-- ============================================================================
-- CHECK 3: Alert Dismissals Indexes (Required)
-- ============================================================================
SELECT 
  'CHECK 3: Alert Dismissals Indexes' as check_name,
  CASE 
    WHEN COUNT(*) >= 3 THEN '✅ PASS - All indexes exist'
    WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL - ' || COUNT(*)::text || ' of 3 indexes exist'
    ELSE '❌ FAIL - No indexes found'
  END as status,
  COUNT(*) as found_count,
  3 as required_count,
  string_agg(indexname, ', ') as indexes_found
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals';

-- ============================================================================
-- CHECK 4: Performance Indexes (Recommended - at least 2)
-- ============================================================================
SELECT 
  'CHECK 4: Performance Indexes' as check_name,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ PASS - All indexes exist'
    WHEN COUNT(*) >= 2 THEN '⚠️ PARTIAL - ' || COUNT(*)::text || ' of 4 indexes exist (minimum met)'
    ELSE '❌ FAIL - Only ' || COUNT(*)::text || ' indexes found (need at least 2)'
  END as status,
  COUNT(*) as found_count,
  4 as required_count,
  string_agg(indexname, ', ') as indexes_found
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
  'idx_vehicle_chat_history_device_user_created',
  'idx_proactive_vehicle_events_notified_device_created',
  'idx_position_history_device_recorded_recent',
  'idx_vehicle_trips_device_start_time_recent'
);

-- ============================================================================
-- CHECK 5: RLS Policies on Alert Dismissals (Required)
-- ============================================================================
SELECT 
  'CHECK 5: RLS Policies' as check_name,
  CASE 
    WHEN COUNT(*) >= 3 THEN '✅ PASS - All policies exist'
    WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL - ' || COUNT(*)::text || ' of 3 policies exist'
    ELSE '❌ FAIL - No policies found'
  END as status,
  COUNT(*) as found_count,
  3 as required_count,
  string_agg(policyname, ', ') as policies_found
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals';

-- ============================================================================
-- CHECK 6: Critical Tables Exist (Required)
-- ============================================================================
SELECT 
  'CHECK 6: Critical Tables' as check_name,
  CASE 
    WHEN COUNT(*) >= 5 THEN '✅ PASS - All critical tables exist'
    ELSE '⚠️ PARTIAL - ' || COUNT(*)::text || ' of 5 tables found'
  END as status,
  COUNT(*) as found_count,
  5 as required_count,
  string_agg(table_name, ', ') as tables_found
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name IN (
  'vehicles',
  'vehicle_positions',
  'vehicle_chat_history',
  'proactive_vehicle_events',
  'vehicle_trips'
);

-- ============================================================================
-- SUMMARY: Overall Production Readiness
-- ============================================================================
WITH checks AS (
  -- Function check
  SELECT 
    CASE WHEN COUNT(*) = 3 THEN 1 ELSE 0 END as functions_ok
  FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain')
),
tables_check AS (
  -- Table check
  SELECT 
    CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END as table_ok
  FROM information_schema.tables
  WHERE table_schema = 'public' 
  AND table_name = 'alert_dismissals'
),
indexes_check AS (
  -- Indexes check (at least 2 performance indexes)
  SELECT 
    CASE WHEN COUNT(*) >= 2 THEN 1 ELSE 0 END as indexes_ok
  FROM pg_indexes 
  WHERE schemaname = 'public' 
  AND indexname IN (
    'idx_vehicle_chat_history_device_user_created',
    'idx_proactive_vehicle_events_notified_device_created',
    'idx_position_history_device_recorded_recent',
    'idx_vehicle_trips_device_start_time_recent'
  )
),
policies_check AS (
  -- Policies check
  SELECT 
    CASE WHEN COUNT(*) >= 3 THEN 1 ELSE 0 END as policies_ok
  FROM pg_policies
  WHERE schemaname = 'public' 
  AND tablename = 'alert_dismissals'
)
SELECT 
  'SUMMARY: Production Readiness' as check_name,
  CASE 
    WHEN (SELECT functions_ok FROM checks) = 1 
     AND (SELECT table_ok FROM tables_check) = 1
     AND (SELECT indexes_ok FROM indexes_check) = 1
     AND (SELECT policies_ok FROM policies_check) = 1
    THEN '✅ READY FOR PRODUCTION'
    WHEN (SELECT functions_ok FROM checks) = 1 
     AND (SELECT table_ok FROM tables_check) = 1
     AND (SELECT indexes_ok FROM indexes_check) = 0
    THEN '⚠️ MOSTLY READY - Missing performance indexes (optional)'
    ELSE '❌ NOT READY - Critical components missing'
  END as status,
  (
    (SELECT functions_ok FROM checks) +
    (SELECT table_ok FROM tables_check) +
    (SELECT indexes_ok FROM indexes_check) +
    (SELECT policies_ok FROM policies_check)
  ) as passed_checks,
  4 as total_checks,
  CASE 
    WHEN (SELECT functions_ok FROM checks) = 0 THEN 'Missing database functions. '
    ELSE ''
  END ||
  CASE 
    WHEN (SELECT table_ok FROM tables_check) = 0 THEN 'Missing alert_dismissals table. '
    ELSE ''
  END ||
  CASE 
    WHEN (SELECT indexes_ok FROM indexes_check) = 0 THEN 'Missing performance indexes (optional but recommended). '
    ELSE ''
  END ||
  CASE 
    WHEN (SELECT policies_ok FROM policies_check) = 0 THEN 'Missing RLS policies. '
    ELSE ''
  END as issues;

-- ============================================================================
-- NEXT STEPS (Based on Results Above)
-- ============================================================================
-- 
-- If you see ❌ FAIL or ⚠️ PARTIAL:
-- 1. Review PRODUCTION_FIX_PLAN.md for detailed fix instructions
-- 2. Run QUICK_FIX_GUIDE.md for fastest path to fix
-- 3. Re-run this verification after fixes
--
-- If you see ✅ PASS or ✅ READY:
-- 1. Verify edge functions are deployed (check Supabase Dashboard)
-- 2. Run smoke tests (login, vehicle sync, chat, RLS)
-- 3. Monitor logs for first 24 hours after launch
--
-- ============================================================================
