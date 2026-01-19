-- Verify that GPS Sync Health view now matches frontend logic
-- After running the migration, this should show: 778 online, 14 moving

SELECT 
  'GPS Sync Health View (After Fix)' as source,
  total_vehicles,
  online_count,
  moving_count,
  stale_count,
  format('%s seconds', avg_age_seconds::integer) as avg_age
FROM v_gps_sync_health;

-- Compare with direct query (should match)
SELECT 
  'Direct Query (Frontend Logic)' as source,
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
  ) as online_count,
  COUNT(*) FILTER (
    WHERE is_online = true 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL 
    AND NOT (latitude = 0 AND longitude = 0)
    AND speed > 0
  ) as moving_count
FROM vehicle_positions;
