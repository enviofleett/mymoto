-- Check for vehicles with invalid GPS coordinates
-- This helps identify vehicles showing "online" with invalid coordinates (e.g., lat 290)

-- Count vehicles with invalid coordinates
SELECT 
  'Invalid Coordinates Summary' as check_type,
  COUNT(*) FILTER (
    WHERE latitude IS NOT NULL 
    AND (latitude < -90 OR latitude > 90)
  ) as invalid_latitude_count,
  COUNT(*) FILTER (
    WHERE longitude IS NOT NULL 
    AND (longitude < -180 OR longitude > 180)
  ) as invalid_longitude_count,
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND (
      latitude IS NULL 
      OR longitude IS NULL 
      OR latitude < -90 
      OR latitude > 90 
      OR longitude < -180 
      OR longitude > 180
      OR (latitude = 0 AND longitude = 0)
    )
  ) as online_with_invalid_coords,
  COUNT(*) as total_vehicles
FROM vehicle_positions;

-- Show specific vehicles with invalid coordinates
SELECT 
  device_id,
  latitude,
  longitude,
  is_online,
  speed,
  cached_at,
  CASE 
    WHEN latitude IS NULL OR longitude IS NULL THEN 'NULL coordinates'
    WHEN latitude < -90 OR latitude > 90 THEN 'Invalid latitude'
    WHEN longitude < -180 OR longitude > 180 THEN 'Invalid longitude'
    WHEN latitude = 0 AND longitude = 0 THEN 'Null island (0,0)'
    ELSE 'Unknown issue'
  END as issue_type
FROM vehicle_positions
WHERE 
  -- Invalid if coordinates are out of range
  (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
  OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
  -- Or if coordinates are null but vehicle is marked online
  OR (is_online = true AND (latitude IS NULL OR longitude IS NULL))
  -- Or if coordinates are (0,0) but vehicle is marked online
  OR (is_online = true AND latitude = 0 AND longitude = 0)
ORDER BY cached_at DESC
LIMIT 50;
