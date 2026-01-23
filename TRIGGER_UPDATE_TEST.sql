-- =============================================================================
-- TEST SCRIPT: Trigger Vehicle Position Update
-- =============================================================================
-- This script manually updates a vehicle's position to test realtime updates.
-- Use this to verify that location changes appear instantly in the UI.
--
-- INSTRUCTIONS:
-- 1. Replace 'YOUR_DEVICE_ID' with an actual device ID from your database
-- 2. Run this script in Supabase SQL Editor
-- 3. Watch the browser console for realtime update logs
-- 4. Observe the map updating instantly
-- =============================================================================

-- First, let's see available devices
SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  gps_time,
  is_online
FROM vehicle_positions
ORDER BY gps_time DESC
LIMIT 10;

-- =============================================================================
-- MANUAL TEST: Update a specific vehicle's position
-- =============================================================================
-- Instructions:
-- 1. Uncomment the UPDATE statement below
-- 2. Replace 'YOUR_DEVICE_ID' with an actual device_id from the query above
-- 3. Run the UPDATE statement
-- 4. Check browser console for "[Realtime] Position update received"
-- 5. Verify map updates instantly without page refresh

/*
UPDATE vehicle_positions
SET 
  latitude = latitude + 0.001,  -- Move ~111 meters north
  longitude = longitude + 0.001, -- Move ~111 meters east
  gps_time = NOW(),
  cached_at = NOW()
WHERE device_id = 'YOUR_DEVICE_ID';
*/

-- =============================================================================
-- AUTOMATED TEST: Simulate vehicle movement
-- =============================================================================
-- This creates a series of position updates to simulate a moving vehicle
-- Uncomment to run (updates position every 5 seconds in a square pattern)

/*
DO $$
DECLARE
  test_device_id TEXT := 'YOUR_DEVICE_ID'; -- Change this!
  base_lat NUMERIC;
  base_lon NUMERIC;
  i INTEGER;
BEGIN
  -- Get current position
  SELECT latitude, longitude INTO base_lat, base_lon
  FROM vehicle_positions
  WHERE device_id = test_device_id;
  
  IF base_lat IS NULL THEN
    RAISE EXCEPTION 'Device % not found', test_device_id;
  END IF;
  
  RAISE NOTICE 'Starting movement simulation for device: %', test_device_id;
  RAISE NOTICE 'Base position: lat=%, lon=%', base_lat, base_lon;
  
  -- Simulate 4 position updates in a square pattern
  FOR i IN 1..4 LOOP
    UPDATE vehicle_positions
    SET 
      latitude = base_lat + (0.001 * (i % 2)),
      longitude = base_lon + (0.001 * ((i+1) % 2)),
      speed = 30 + (i * 5), -- Simulate changing speed
      gps_time = NOW(),
      cached_at = NOW()
    WHERE device_id = test_device_id;
    
    RAISE NOTICE 'Update %: Position updated', i;
    PERFORM pg_sleep(5); -- Wait 5 seconds between updates
  END LOOP;
  
  -- Return to original position
  UPDATE vehicle_positions
  SET 
    latitude = base_lat,
    longitude = base_lon,
    speed = 0,
    gps_time = NOW(),
    cached_at = NOW()
  WHERE device_id = test_device_id;
  
  RAISE NOTICE 'Movement simulation complete - returned to base position';
END $$;
*/

-- =============================================================================
-- VERIFY UPDATE
-- =============================================================================
-- Run this to confirm the update was applied

/*
SELECT 
  device_id,
  latitude,
  longitude,
  speed,
  gps_time,
  cached_at
FROM vehicle_positions
WHERE device_id = 'YOUR_DEVICE_ID';
*/

-- =============================================================================
-- EXPECTED BEHAVIOR IN BROWSER
-- =============================================================================
-- After running the UPDATE:
-- 1. Console shows: "[Realtime] Position update received for [deviceId]"
-- 2. Console shows: "[Realtime] Mapped data: {latitude: X, longitude: Y}"
-- 3. Console shows: "[Realtime] Cache updated for [deviceId]"
-- 4. Map marker moves to new position (no page refresh needed)
-- 5. "Updated" timestamp changes instantly
-- 6. Address may update if location changed significantly
--
-- Latency: Should be < 1 second from database update to UI update
-- =============================================================================

-- =============================================================================
-- DEBUGGING: Check realtime is working
-- =============================================================================
-- If updates don't appear in console, run these checks:

-- 1. Verify realtime is enabled
SELECT
  'Realtime Enabled' as check,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ YES'
    ELSE '❌ NO - Run APPLY_REALTIME_FIX.sql'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'vehicle_positions';

-- 2. Verify REPLICA IDENTITY is FULL
SELECT
  'REPLICA IDENTITY' as check,
  CASE c.relreplident
    WHEN 'f' THEN '✅ FULL'
    ELSE '❌ NOT FULL - Run APPLY_REALTIME_FIX.sql'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';

-- 3. Check recent position updates
SELECT 
  device_id,
  gps_time,
  cached_at,
  AGE(NOW(), cached_at) as age
FROM vehicle_positions
ORDER BY cached_at DESC
LIMIT 5;
