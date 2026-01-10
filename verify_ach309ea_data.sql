-- SQL Verification Queries for ACH309EA
-- Run these queries in Supabase SQL Editor to diagnose the issue

-- =====================================================
-- 1. Check if vehicle exists in vehicles table
-- =====================================================
SELECT
  device_id,
  device_name,
  latitude,
  longitude,
  speed,
  battery_percent,
  total_mileage,
  status,
  last_updated
FROM vehicles
WHERE device_id = 'ACH309EA';

-- =====================================================
-- 2. Check raw GPS data in position_history
-- =====================================================
SELECT
  count(*) as total_points,
  min(gps_time) as earliest_point,
  max(gps_time) as latest_point,
  count(DISTINCT DATE(gps_time)) as days_with_data
FROM position_history
WHERE device_id = 'ACH309EA';

-- =====================================================
-- 3. Check if trips have been calculated
-- =====================================================
SELECT
  count(*) as trip_count,
  sum(distance_km) as total_distance,
  min(start_time) as earliest_trip,
  max(start_time) as latest_trip
FROM vehicle_trips
WHERE device_id = 'ACH309EA';

-- =====================================================
-- 4. Check daily stats view
-- =====================================================
SELECT
  stat_date,
  trip_count,
  total_distance_km,
  peak_speed
FROM vehicle_daily_stats
WHERE device_id = 'ACH309EA'
ORDER BY stat_date DESC
LIMIT 10;

-- =====================================================
-- 5. Check LLM settings (for the foreign key issue)
-- =====================================================
SELECT * FROM vehicle_llm_settings
WHERE device_id = 'ACH309EA';

-- =====================================================
-- 6. Test RPC functions
-- =====================================================
SELECT get_vehicle_mileage_stats('ACH309EA');
SELECT * FROM get_daily_mileage('ACH309EA');

-- =====================================================
-- 7. Check recent position updates
-- =====================================================
SELECT
  gps_time,
  latitude,
  longitude,
  speed,
  ignition_on,
  battery_percent
FROM position_history
WHERE device_id = 'ACH309EA'
ORDER BY gps_time DESC
LIMIT 5;
