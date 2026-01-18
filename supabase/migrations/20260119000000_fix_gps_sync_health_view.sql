-- Fix v_gps_sync_health view to match frontend metrics logic
-- This ensures GPS Sync Health Dashboard shows the same numbers as Metrics Grid

-- The issue:
-- 1. GPS Sync Health was using sync_priority = 'high' (speed > 3 km/h) for moving count
--    But frontend uses speed > 0 for "Moving Now"
-- 2. GPS Sync Health was counting ALL vehicles with is_online = true
--    But frontend only counts vehicles with valid GPS coordinates

-- Solution: Update view to match frontend logic exactly

CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  
  -- Online: is_online = true AND has valid GPS coordinates (matches frontend)
  -- Frontend logic: status !== 'offline' requires is_online = true AND valid coords
  -- Valid coordinates: lat between -90 and 90, lon between -180 and 180, not (0,0)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  
  -- Moving: speed > 0 AND online AND has valid coordinates (matches frontend)
  -- Frontend logic: status = 'moving' requires speed > 0 AND is_online = true AND valid coords
  -- Valid coordinates: lat between -90 and 90, lon between -180 and 180, not (0,0)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed > 0
  ) as moving_count,
  
  -- Stale: data older than 5 minutes (unchanged)
  COUNT(*) FILTER (WHERE cached_at < now() - interval '5 minutes') as stale_count,
  
  -- Sync timing metrics (unchanged)
  MIN(cached_at) as oldest_sync,
  MAX(cached_at) as newest_sync,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - cached_at)))::numeric, 1) as avg_age_seconds
FROM vehicle_positions;

-- Add comment explaining the logic
COMMENT ON VIEW v_gps_sync_health IS 
'GPS synchronization health metrics. 
Online count: Vehicles with is_online = true AND valid GPS coordinates (lat -90 to 90, lon -180 to 180, not 0,0).
Moving count: Vehicles with speed > 0 AND online AND valid coordinates (matches frontend "Moving Now" metric).
This view ensures consistency between GPS Sync Health Dashboard and Metrics Grid.
Invalid coordinates (e.g., lat 290) are filtered out to show only real data.';
