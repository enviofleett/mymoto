-- Check which vehicles have speeds > 200
-- This will help us determine if they're legitimate high speeds or normalization errors

SELECT 
  device_id,
  speed,
  CASE 
    WHEN speed > 200 AND speed < 1000 THEN '⚠️ Likely m/h (should be normalized)'
    WHEN speed >= 1000 THEN '❌ Definitely m/h (not normalized)'
    WHEN speed > 200 AND speed <= 300 THEN '✅ Possibly valid high speed (300 km/h max)'
    ELSE '✅ Normalized'
  END as speed_status,
  cached_at,
  NOW() - cached_at as age
FROM vehicle_positions
WHERE speed > 200
ORDER BY speed DESC
LIMIT 10;

-- Check if these are recent (normalized) or old (not normalized)
SELECT 
  'Speed > 200 Analysis' as check_name,
  COUNT(*) FILTER (WHERE speed > 200 AND speed < 1000) as likely_mh_count,
  COUNT(*) FILTER (WHERE speed >= 1000) as definitely_mh_count,
  COUNT(*) FILTER (WHERE speed > 200 AND speed <= 300 AND cached_at >= NOW() - INTERVAL '5 minutes') as recent_high_speed,
  COUNT(*) FILTER (WHERE speed > 200 AND cached_at < NOW() - INTERVAL '5 minutes') as old_non_normalized,
  MAX(speed) as max_speed,
  MIN(speed) FILTER (WHERE speed > 200) as min_non_normalized_speed
FROM vehicle_positions
WHERE speed > 200;


