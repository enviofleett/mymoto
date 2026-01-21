-- Diagnostic Queries for RBC784CX Device
-- Run these in Supabase SQL Editor to investigate why sync returned 0 trips

-- =====================================================
-- 1. Check if device exists in vehicles table
-- =====================================================
SELECT 
  device_id,
  device_name,
  device_type,
  gps_owner,
  last_synced_at,
  created_at
FROM vehicles
WHERE device_id = 'RBC784CX' OR device_name = 'RBC784CX';

-- =====================================================
-- 2. Check all device IDs (to find correct format)
-- =====================================================
-- GPS51 typically uses numeric device IDs, not alphanumeric
SELECT 
  device_id,
  device_name,
  gps_owner
FROM vehicles
WHERE device_name ILIKE '%RBC784CX%' OR device_id ILIKE '%RBC784CX%'
ORDER BY device_id
LIMIT 10;

-- =====================================================
-- 3. Check if device has existing trips
-- =====================================================
SELECT 
  COUNT(*) as total_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  COUNT(*) FILTER (WHERE start_time >= NOW() - INTERVAL '30 days') as trips_last_30_days
FROM vehicle_trips
WHERE device_id = 'RBC784CX';

-- =====================================================
-- 4. Check position_history for this device
-- =====================================================
SELECT 
  COUNT(*) as position_count,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(*) FILTER (WHERE gps_time >= NOW() - INTERVAL '30 days') as positions_last_30_days
FROM position_history
WHERE device_id = 'RBC784CX';

-- =====================================================
-- 5. Find devices with recent trips (to test with)
-- =====================================================
SELECT 
  device_id,
  device_name,
  COUNT(*) as trip_count,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE start_time >= NOW() - INTERVAL '7 days'
GROUP BY device_id, device_name
ORDER BY trip_count DESC
LIMIT 10;

-- =====================================================
-- 6. Check GPS51 token status
-- =====================================================
SELECT 
  key,
  expires_at,
  CASE 
    WHEN expires_at IS NULL THEN 'No expiry set'
    WHEN expires_at > NOW() THEN '✅ Valid'
    ELSE '❌ Expired'
  END as token_status,
  metadata->>'username' as username,
  metadata->>'serverid' as serverid
FROM app_settings
WHERE key = 'gps_token';
