-- =====================================================
-- FINAL PRODUCTION READINESS VERIFICATION
-- Device: 13612333441
-- Run this to confirm everything is ready for LIVE
-- =====================================================

-- 1. ✅ VERIFY NO DUPLICATES
SELECT 
  'DUPLICATE CHECK' as verification_step,
  COUNT(*) as total_trips,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips,
  COUNT(*) - COUNT(DISTINCT (start_time, end_time)) as duplicate_count,
  CASE 
    WHEN COUNT(*) = COUNT(DISTINCT (start_time, end_time)) THEN '✅ PASS - No duplicates'
    ELSE '❌ FAIL - ' || (COUNT(*) - COUNT(DISTINCT (start_time, end_time)))::text || ' duplicates found'
  END as status
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 2. ✅ VERIFY SYNC STATUS
-- Check if trips_total column exists, if not, query without it
SELECT 
  'SYNC STATUS CHECK' as verification_step,
  sync_status,
  last_sync_at AT TIME ZONE 'UTC' as last_sync_at_utc,
  trips_processed,
  error_message,
  CASE 
    WHEN sync_status = 'completed' AND error_message IS NULL THEN '✅ PASS - Sync healthy'
    WHEN sync_status = 'idle' AND error_message IS NULL THEN '✅ PASS - Sync idle (normal)'
    WHEN sync_status = 'error' THEN '❌ FAIL - Sync error: ' || COALESCE(error_message, 'Unknown')
    WHEN sync_status = 'processing' THEN '⚠️ WARNING - Sync in progress'
    ELSE '⚠️ UNKNOWN - Status: ' || sync_status
  END as status
FROM trip_sync_status
WHERE device_id = '13612333441';

-- 3. ✅ VERIFY DATA QUALITY
SELECT 
  'DATA QUALITY CHECK' as verification_step,
  COUNT(*) as total_trips,
  COUNT(CASE WHEN start_latitude != 0 AND start_longitude != 0 AND end_latitude != 0 AND end_longitude != 0 THEN 1 END) as trips_with_coords,
  COUNT(CASE WHEN distance_km >= 0.1 THEN 1 END) as trips_over_100m,
  COUNT(CASE WHEN duration_seconds > 0 THEN 1 END) as trips_with_duration,
  SUM(distance_km) as total_distance_km,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS - ' || COUNT(*)::text || ' trips found'
    ELSE '❌ FAIL - No trips found'
  END as status
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 4. ✅ VERIFY DATE RANGE
SELECT 
  'DATE RANGE CHECK' as verification_step,
  MIN(start_time) AT TIME ZONE 'UTC' as earliest_trip,
  MAX(start_time) AT TIME ZONE 'UTC' as latest_trip,
  COUNT(DISTINCT DATE(start_time AT TIME ZONE 'UTC')) as days_with_trips,
  CASE 
    WHEN MIN(start_time) IS NOT NULL THEN '✅ PASS - Date range: ' || MIN(start_time)::date || ' to ' || MAX(start_time)::date
    ELSE '❌ FAIL - No trips found'
  END as status
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 5. ✅ VERIFY TRIP COUNT MATCH
-- This compares database unique trips with GPS51 expected count (~50-100)
SELECT 
  'TRIP COUNT MATCH' as verification_step,
  COUNT(DISTINCT (start_time, end_time)) as unique_trips_in_db,
  CASE 
    WHEN COUNT(DISTINCT (start_time, end_time)) BETWEEN 50 AND 100 THEN '✅ PASS - Trip count in expected range (50-100)'
    WHEN COUNT(DISTINCT (start_time, end_time)) < 50 THEN '⚠️ WARNING - Lower than expected (expected ~50-100)'
    WHEN COUNT(DISTINCT (start_time, end_time)) > 100 THEN '⚠️ WARNING - Higher than expected (expected ~50-100)'
    ELSE '❓ UNKNOWN - Trip count: ' || COUNT(DISTINCT (start_time, end_time))::text
  END as status
FROM vehicle_trips
WHERE device_id = '13612333441';

-- 6. ✅ SUMMARY - ALL CHECKS
SELECT 
  '=== PRODUCTION READINESS SUMMARY ===' as summary,
  '' as separator_1,
  (SELECT COUNT(DISTINCT (start_time, end_time)) FROM vehicle_trips WHERE device_id = '13612333441') || ' unique trips' as unique_trips,
  (SELECT SUM(distance_km) FROM vehicle_trips WHERE device_id = '13612333441') || ' km total distance' as total_distance,
  (SELECT CASE WHEN COUNT(*) = COUNT(DISTINCT (start_time, end_time)) THEN '✅ No duplicates' ELSE '❌ ' || (COUNT(*) - COUNT(DISTINCT (start_time, end_time)))::text || ' duplicates' END FROM vehicle_trips WHERE device_id = '13612333441') as duplicate_status,
  (SELECT CASE WHEN sync_status = 'completed' OR sync_status = 'idle' THEN '✅ Sync healthy' ELSE '❌ Sync error' END FROM trip_sync_status WHERE device_id = '13612333441') as sync_status;

-- 7. 🎯 FINAL GO/NO-GO DECISION
SELECT 
  CASE 
    WHEN 
      -- Check 1: No duplicates
      (SELECT COUNT(*) = COUNT(DISTINCT (start_time, end_time)) FROM vehicle_trips WHERE device_id = '13612333441')
      AND
      -- Check 2: Sync status is healthy
      (SELECT sync_status IN ('completed', 'idle') AND error_message IS NULL FROM trip_sync_status WHERE device_id = '13612333441')
      AND
      -- Check 3: Has trips
      (SELECT COUNT(*) > 0 FROM vehicle_trips WHERE device_id = '13612333441')
    THEN '✅ READY FOR LIVE - All checks passed'
    ELSE '❌ NOT READY - Review failed checks above'
  END as production_ready_status;
