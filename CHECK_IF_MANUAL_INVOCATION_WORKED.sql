-- Check if the manual invocation updated the database
-- Run this immediately after invoking the function manually

SELECT 
  device_id,
  cached_at,
  gps_time,
  latitude,
  longitude,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_since_cached,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_since_gps_time
FROM vehicle_positions
WHERE device_id = '358657105966092';

-- If cached_at is still old, the function might have:
-- 1. Returned cached data (shouldn't happen with use_cache: false)
-- 2. Failed silently
-- 3. GPS51 API didn't return data for this device

-- Check Edge Function logs to see what happened
-- Go to: Supabase Dashboard → Edge Functions → gps-data → Logs
