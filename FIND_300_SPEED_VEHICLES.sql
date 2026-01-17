-- Find the specific vehicles with speed = 300
-- This will help us determine if it's a normalization issue or legitimate high speed

SELECT 
  device_id,
  speed,
  cached_at,
  NOW() - cached_at as age,
  'If speed=300, it could be 300000 m/h (300 km/h) or 300 m/h (should be 0.3 km/h → 0)' as analysis
FROM vehicle_positions
WHERE speed = 300
  AND cached_at >= NOW() - INTERVAL '5 minutes'
ORDER BY cached_at DESC;

-- Check if there are any other speeds > 200 but < 1000
-- These would definitely be m/h values that should be normalized
SELECT 
  'Speeds between 200-1000 (definitely m/h)' as check_name,
  COUNT(*) as count,
  MIN(speed) as min_speed,
  MAX(speed) as max_speed,
  STRING_AGG(DISTINCT device_id::text, ', ') as device_ids
FROM vehicle_positions
WHERE speed > 200 AND speed < 1000
  AND cached_at >= NOW() - INTERVAL '5 minutes';


