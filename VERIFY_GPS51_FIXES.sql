-- SQL Queries to Verify GPS51 Reconciliation Fixes
-- Run these in Supabase SQL Editor (NOT the bash commands!)

-- ============================================================================
-- 1. CHECK COORDINATE COMPLETENESS (Should be 90-95% after fixes)
-- ============================================================================
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- 2. CHECK FIRST SYNC HISTORY COVERAGE (Should be 30 days for new devices)
-- ============================================================================
SELECT 
  device_id,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  COUNT(*) as trip_count,
  EXTRACT(EPOCH FROM (MAX(start_time) - MIN(start_time))) / 86400 as days_covered,
  CASE 
    WHEN MIN(start_time) >= NOW() - INTERVAL '30 days' THEN '✅ Has 30 days'
    ELSE '❌ Less than 30 days'
  END as history_status
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY device_id
ORDER BY earliest_trip;

-- ============================================================================
-- 3. FIND TRIPS WITH MISSING COORDINATES (For reconciliation)
-- ============================================================================
SELECT 
  id,
  device_id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km
FROM vehicle_trips
WHERE (start_latitude = 0 OR start_longitude = 0 OR end_latitude = 0 OR end_longitude = 0)
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- 4. OVERALL HEALTH METRICS
-- ============================================================================
SELECT 
  COUNT(*) as total_trips,
  COUNT(DISTINCT device_id) as devices_with_trips,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as trips_missing_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_coords_percent,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- 5. CHECK IF POSITION HISTORY EXISTS FOR BACKFILLING
-- ============================================================================
-- Replace 'YOUR_DEVICE_ID' and '2026-01-21 10:00:00' with actual values
SELECT 
  device_id,
  gps_time,
  latitude,
  longitude,
  speed
FROM position_history
WHERE device_id = 'YOUR_DEVICE_ID'
  AND gps_time BETWEEN 
    (TIMESTAMP '2026-01-21 10:00:00' - INTERVAL '15 minutes') AND
    (TIMESTAMP '2026-01-21 10:00:00' + INTERVAL '15 minutes')
ORDER BY gps_time;

-- ============================================================================
-- 6. COMPARE TRIP DISTANCES (Check if GPS51 distances are being used)
-- ============================================================================
SELECT 
  device_id,
  COUNT(*) as trip_count,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(MIN(distance_km)::numeric, 2) as min_distance_km,
  ROUND(MAX(distance_km)::numeric, 2) as max_distance_km
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND distance_km > 0
GROUP BY device_id
ORDER BY trip_count DESC
LIMIT 20;
