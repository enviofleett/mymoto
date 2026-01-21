-- Verification Queries - Fixed (No Division by Zero Errors)
-- Run these in Supabase SQL Editor

-- =====================================================
-- 1. Coordinate Completeness (Fixed)
-- =====================================================
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2)
    ELSE 0
  END as completeness_percent
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND created_at >= NOW() - INTERVAL '10 minutes';

-- =====================================================
-- 2. Travel Time Accuracy (Fixed)
-- =====================================================
SELECT 
  COUNT(*) FILTER (
    WHERE ABS(duration_seconds - EXTRACT(EPOCH FROM (end_time - start_time))) < 1
  ) as matching_duration,
  COUNT(*) as total_trips,
  CASE 
    WHEN COUNT(*) > 0 THEN
      ROUND(COUNT(*) FILTER (
        WHERE ABS(duration_seconds - EXTRACT(EPOCH FROM (end_time - start_time))) < 1
      ) * 100.0 / COUNT(*), 2)
    ELSE 0
  END as accuracy_percent
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND created_at >= NOW() - INTERVAL '10 minutes';

-- =====================================================
-- 3. Sample Trips with Duration Check
-- =====================================================
SELECT 
  start_time,
  end_time,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) as calculated_duration_seconds,
  CASE 
    WHEN ABS(duration_seconds - EXTRACT(EPOCH FROM (end_time - start_time))) < 1 THEN '✅ Matches GPS51'
    ELSE '❌ Mismatch'
  END as duration_check
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY start_time DESC
LIMIT 10;

-- =====================================================
-- 4. Overall Statistics
-- =====================================================
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2)
    ELSE 0
  END as completeness_percent,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(AVG(duration_seconds)::numeric / 60, 2) as avg_duration_minutes,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE device_id = '358657106048551'
  AND created_at >= NOW() - INTERVAL '10 minutes';
