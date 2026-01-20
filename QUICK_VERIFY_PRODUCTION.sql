-- ============================================================================
-- QUICK PRODUCTION VERIFICATION
-- Copy and paste this ENTIRE file into Supabase SQL Editor
-- ============================================================================

-- Check 1: Database Functions
SELECT 
  'Database Functions' as check_name,
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ PASS'
    ELSE '❌ FAIL - Missing ' || (3 - COUNT(*))::text || ' functions'
  END as status,
  COUNT(*) as found,
  3 as required
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain');

-- Check 2: Alert Dismissals Table
SELECT 
  'Alert Dismissals Table' as check_name,
  CASE 
    WHEN COUNT(*) = 1 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status,
  COUNT(*) as found,
  1 as required
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name = 'alert_dismissals';

-- Check 3: Alert Dismissals Indexes
SELECT 
  'Alert Dismissals Indexes' as check_name,
  CASE 
    WHEN COUNT(*) >= 3 THEN '✅ PASS'
    WHEN COUNT(*) > 0 THEN '⚠️ PARTIAL'
    ELSE '❌ FAIL'
  END as status,
  COUNT(*) as found,
  3 as required
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals';

-- Check 4: Performance Indexes (at least 2)
SELECT 
  'Performance Indexes' as check_name,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ PASS'
    WHEN COUNT(*) >= 2 THEN '⚠️ PARTIAL (OK)'
    ELSE '⚠️ MISSING (Optional)'
  END as status,
  COUNT(*) as found,
  4 as required
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname IN (
  'idx_vehicle_chat_history_device_user_created',
  'idx_proactive_vehicle_events_notified_device_created',
  'idx_position_history_device_recorded_recent',
  'idx_vehicle_trips_device_start_time_recent'
);

-- Check 5: RLS Policies
SELECT 
  'RLS Policies' as check_name,
  CASE 
    WHEN COUNT(*) >= 3 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status,
  COUNT(*) as found,
  3 as required
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'alert_dismissals';

-- FINAL SUMMARY
WITH checks AS (
  SELECT 
    CASE WHEN COUNT(*) = 3 THEN 1 ELSE 0 END as functions_ok
  FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name IN ('get_daily_travel_stats', 'get_trip_patterns', 'calculate_battery_drain')
),
tables_check AS (
  SELECT 
    CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END as table_ok
  FROM information_schema.tables
  WHERE table_schema = 'public' 
  AND table_name = 'alert_dismissals'
),
indexes_check AS (
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
  SELECT 
    CASE WHEN COUNT(*) >= 3 THEN 1 ELSE 0 END as policies_ok
  FROM pg_policies
  WHERE schemaname = 'public' 
  AND tablename = 'alert_dismissals'
)
SELECT 
  '=== FINAL STATUS ===' as check_name,
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
  )::text || ' of 4 checks passed' as details;
