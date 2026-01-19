-- Quick check: Are NEW positions (last 5 minutes) normalized?
SELECT 
  '🆕 NEW Data Check (Last 5 Min)' as check_name,
  COUNT(*) as total_new_records,
  COUNT(*) FILTER (WHERE speed > 200) as non_normalized_count,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_count,
  ROUND(AVG(speed)::numeric, 2) as avg_speed,
  MIN(speed) as min_speed,
  MAX(speed) as max_speed,
  MAX(cached_at) as last_sync_time,
  CASE 
    WHEN COUNT(*) = 0 THEN '⏳ No new data - Trigger sync or wait for cron'
    WHEN MAX(speed) > 200 THEN '❌ NOT NORMALIZED - Found speeds > 200'
    WHEN MAX(speed) <= 200 AND MAX(speed) > 0 THEN '✅ NORMALIZED - All speeds ≤ 200 km/h'
    ELSE 'All stationary (speed = 0)'
  END as status
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '5 minutes';

-- Show the 2 vehicles with speeds > 200 (if they're recent, there's a problem)
SELECT 
  device_id,
  speed,
  cached_at,
  NOW() - cached_at as age,
  CASE 
    WHEN cached_at >= NOW() - INTERVAL '5 minutes' THEN '❌ RECENT - Normalizer not working!'
    WHEN cached_at >= NOW() - INTERVAL '1 hour' THEN '⚠️ Recent (1 hour) - May need update'
    ELSE '✅ OLD - Will be updated on next sync'
  END as issue_status
FROM vehicle_positions
WHERE speed > 200
ORDER BY cached_at DESC;


