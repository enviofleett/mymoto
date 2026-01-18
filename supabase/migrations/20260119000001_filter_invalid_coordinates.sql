-- Filter invalid GPS coordinates from dashboard
-- This migration ensures only real, valid GPS data shows up on the dashboard
-- Invalid coordinates (e.g., lat 290, lon 500) are filtered out

-- Update v_gps_sync_health view to filter invalid coordinates
CREATE OR REPLACE VIEW v_gps_sync_health AS
SELECT 
  COUNT(*) as total_vehicles,
  
  -- Online: is_online = true AND has valid GPS coordinates
  -- Valid coordinates: lat between -90 and 90, lon between -180 and 180, not (0,0)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  
  -- Moving: speed > 0 AND online AND has valid coordinates
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
  
  -- Stale: data older than 5 minutes
  COUNT(*) FILTER (WHERE cached_at < now() - interval '5 minutes') as stale_count,
  
  -- Low Battery: battery < 20% AND battery > 0 (excludes null/zero)
  COUNT(*) FILTER (
    WHERE battery_percent IS NOT NULL 
    AND battery_percent > 0 
    AND battery_percent < 20
  ) as low_battery_count,
  
  -- Sync timing metrics
  MIN(cached_at) as oldest_sync,
  MAX(cached_at) as newest_sync,
  ROUND(AVG(EXTRACT(EPOCH FROM (now() - cached_at)))::numeric, 1) as avg_age_seconds
FROM vehicle_positions;

-- Add comment explaining the logic
COMMENT ON VIEW v_gps_sync_health IS 
'GPS synchronization health metrics. 
Online count: Vehicles with is_online = true AND valid GPS coordinates (lat -90 to 90, lon -180 to 180, not 0,0).
Moving count: Vehicles with speed > 0 AND online AND valid coordinates (matches frontend "Moving Now" metric).
Low battery count: Vehicles with battery_percent < 20% AND > 0 (excludes null/zero).
This view ensures consistency between GPS Sync Health Dashboard and Metrics Grid.
Invalid coordinates (e.g., lat 290) are filtered out to show only real data.';

-- Optional: Create a function to identify vehicles with invalid coordinates
-- This can be used for monitoring and cleanup
CREATE OR REPLACE FUNCTION get_invalid_coordinate_vehicles()
RETURNS TABLE (
  device_id TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  is_online BOOLEAN,
  cached_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vp.device_id,
    vp.latitude,
    vp.longitude,
    vp.is_online,
    vp.cached_at
  FROM vehicle_positions vp
  WHERE 
    -- Invalid if coordinates are out of range
    (vp.latitude IS NOT NULL AND (vp.latitude < -90 OR vp.latitude > 90))
    OR (vp.longitude IS NOT NULL AND (vp.longitude < -180 OR vp.longitude > 180))
    -- Or if coordinates are null but vehicle is marked online
    OR (vp.is_online = true AND (vp.latitude IS NULL OR vp.longitude IS NULL))
    -- Or if coordinates are (0,0) but vehicle is marked online
    OR (vp.is_online = true AND vp.latitude = 0 AND vp.longitude = 0)
  ORDER BY vp.cached_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_invalid_coordinate_vehicles() IS 
'Returns vehicles with invalid GPS coordinates (out of range, null, or 0,0).
Use this function to monitor and identify vehicles that need coordinate cleanup.';
