-- Find device_id for EPE511GA and check its status
-- Run this in Supabase SQL Editor

-- =====================================================
-- 1. Find the correct device_id for EPE511GA
-- =====================================================
SELECT 
  device_id,
  device_name,
  device_type,
  gps_owner,
  last_synced_at,
  created_at
FROM vehicles
WHERE device_name = 'EPE511GA' OR device_id = 'EPE511GA'
ORDER BY device_id;

-- =====================================================
-- 2. Check existing trips for this device
-- =====================================================
SELECT 
  COUNT(*) as total_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '30 days') as trips_last_30_days,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = (
  SELECT device_id FROM vehicles WHERE device_name = 'EPE511GA' LIMIT 1
);

-- =====================================================
-- 3. Check position_history for this device
-- =====================================================
SELECT 
  COUNT(*) as position_count,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(*) FILTER (WHERE gps_time >= NOW() - INTERVAL '30 days') as positions_last_30_days
FROM position_history
WHERE device_id = (
  SELECT device_id FROM vehicles WHERE device_name = 'EPE511GA' LIMIT 1
);
