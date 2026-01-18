-- Get Actual Fleet Numbers (Using Frontend Logic)
-- This query matches exactly how the frontend calculates online and moving counts

-- Simple query to get the numbers
SELECT 
  COUNT(*) as total_vehicles,
  
  -- Online: is_online = true AND has valid GPS coordinates (matches frontend)
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
  
  -- Stopped (online but not moving)
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed = 0
  ) as stopped_count,
  
  -- Offline
  COUNT(*) FILTER (WHERE is_online = false) as offline_count,
  
  -- Online but no GPS coordinates
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND (latitude IS NULL OR longitude IS NULL OR (latitude = 0 AND longitude = 0))
  ) as online_no_gps_count
FROM vehicle_positions;
