-- Check Current Fleet Status: Online and Moving Counts
-- This query shows the actual numbers from the database

-- Method 1: Using vehicle_positions table (same as frontend)
SELECT 
  'Current Status from vehicle_positions' as source,
  COUNT(*) as total_vehicles,
  
  -- Online: is_online = true AND has valid GPS coordinates (matches frontend logic)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  
  -- Moving: speed > 0 AND online AND has valid coordinates (matches frontend)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed > 0
  ) as moving_count,
  
  -- Additional breakdown
  COUNT(*) FILTER (WHERE is_online = true) as online_without_coord_check,
  COUNT(*) FILTER (WHERE sync_priority = 'high') as moving_sync_priority_high,
  COUNT(*) FILTER (WHERE speed > 3) as moving_speed_over_3kmh,
  COUNT(*) FILTER (WHERE speed > 0) as moving_speed_over_0kmh
FROM vehicle_positions;

-- Method 2: Using the view (current implementation)
SELECT 
  'From v_gps_sync_health view' as source,
  total_vehicles,
  online_count,
  moving_count,
  stale_count
FROM v_gps_sync_health;

-- Method 3: Detailed breakdown by status
SELECT 
  CASE 
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed > 0 THEN 'Moving'
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed = 0 THEN 'Stopped (Online)'
    WHEN is_online = true 
      AND (latitude IS NULL OR longitude IS NULL OR (latitude = 0 AND longitude = 0)) THEN 'Online (No GPS)'
    ELSE 'Offline'
  END as status,
  COUNT(*) as count
FROM vehicle_positions
GROUP BY 
  CASE 
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed > 0 THEN 'Moving'
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed = 0 THEN 'Stopped (Online)'
    WHEN is_online = true 
      AND (latitude IS NULL OR longitude IS NULL OR (latitude = 0 AND longitude = 0)) THEN 'Online (No GPS)'
    ELSE 'Offline'
  END
ORDER BY count DESC;

-- Method 4: Sample of vehicles in each category (for verification)
SELECT 
  device_id,
  is_online,
  CASE 
    WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND NOT (latitude = 0 AND longitude = 0) 
    THEN 'Valid GPS' 
    ELSE 'No GPS' 
  END as gps_status,
  speed,
  sync_priority,
  CASE 
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed > 0 THEN 'Moving'
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed = 0 THEN 'Stopped'
    WHEN is_online = true THEN 'Online (No GPS)'
    ELSE 'Offline'
  END as calculated_status,
  cached_at,
  EXTRACT(EPOCH FROM (now() - cached_at)) as age_seconds
FROM vehicle_positions
ORDER BY 
  CASE 
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed > 0 THEN 1
    WHEN is_online = true 
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL 
      AND NOT (latitude = 0 AND longitude = 0)
      AND speed = 0 THEN 2
    WHEN is_online = true THEN 3
    ELSE 4
  END,
  cached_at DESC
LIMIT 50;
