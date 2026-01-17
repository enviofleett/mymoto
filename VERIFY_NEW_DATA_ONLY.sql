-- ============================================================================
-- Verify Normalizer - CHECK ONLY NEW DATA (After Deployment)
-- This query only checks data created in the last 5 minutes
-- ============================================================================

-- Check NEW vehicle positions (last 5 minutes)
SELECT 
  '🆕 NEW Vehicle Positions (Last 5 Min)' as check_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE speed > 200) as non_normalized_count,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_count,
  ROUND(AVG(speed)::numeric, 2) as avg_speed,
  MIN(speed) as min_speed,
  MAX(speed) as max_speed,
  MAX(cached_at) as last_sync_time,
  CASE 
    WHEN COUNT(*) = 0 THEN '⏳ No new data yet - Wait for cron job or trigger manually'
    WHEN MAX(speed) > 200 THEN '❌ NOT NORMALIZED - Found speeds > 200'
    WHEN MAX(speed) <= 200 AND MAX(speed) > 0 THEN '✅ NORMALIZED - All speeds ≤ 200 km/h'
    ELSE 'All stationary'
  END as status
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '5 minutes';

-- Check NEW position history (last 5 minutes)
SELECT 
  '🆕 NEW Position History (Last 5 Min)' as check_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE speed > 200) as non_normalized_count,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_count,
  ROUND(AVG(speed)::numeric, 2) as avg_speed,
  MIN(speed) as min_speed,
  MAX(speed) as max_speed,
  MAX(gps_time) as last_gps_time,
  CASE 
    WHEN COUNT(*) = 0 THEN '⏳ No new data yet - Wait for cron job or trigger manually'
    WHEN MAX(speed) > 200 THEN '❌ NOT NORMALIZED - Found speeds > 200'
    WHEN MAX(speed) <= 200 AND MAX(speed) > 0 THEN '✅ NORMALIZED - All speeds ≤ 200 km/h'
    ELSE 'All stationary'
  END as status
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '5 minutes';

-- Check when last sync happened
SELECT 
  '⏰ Last Sync Times' as check_name,
  MAX(cached_at) as last_vehicle_position_sync,
  MAX(gps_time) as last_position_history_sync,
  NOW() - MAX(cached_at) as time_since_last_sync,
  CASE 
    WHEN MAX(cached_at) >= NOW() - INTERVAL '5 minutes' THEN '✅ Recently synced'
    WHEN MAX(cached_at) >= NOW() - INTERVAL '10 minutes' THEN '⚠️ Synced 5-10 min ago'
    ELSE '❌ No recent sync - Trigger manually or wait for cron'
  END as sync_status
FROM (
  SELECT cached_at, NULL::timestamp as gps_time FROM vehicle_positions
  UNION ALL
  SELECT NULL::timestamp as cached_at, gps_time FROM position_history
) combined;

-- Summary: Overall status
SELECT 
  '📊 DEPLOYMENT STATUS SUMMARY' as summary,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vehicle_positions 
      WHERE cached_at >= NOW() - INTERVAL '5 minutes' AND speed > 200
    ) OR EXISTS (
      SELECT 1 FROM position_history 
      WHERE gps_time >= NOW() - INTERVAL '5 minutes' AND speed > 200
    ) THEN '❌ NOT NORMALIZED - New data still has speeds > 200'
    WHEN EXISTS (
      SELECT 1 FROM vehicle_positions 
      WHERE cached_at >= NOW() - INTERVAL '5 minutes' AND speed > 0 AND speed <= 200
    ) OR EXISTS (
      SELECT 1 FROM position_history 
      WHERE gps_time >= NOW() - INTERVAL '5 minutes' AND speed > 0 AND speed <= 200
    ) THEN '✅ NORMALIZED - New data is normalized (≤ 200 km/h)'
    WHEN EXISTS (
      SELECT 1 FROM vehicle_positions WHERE cached_at >= NOW() - INTERVAL '10 minutes'
    ) THEN '⏳ WAITING - New data exists but all speeds are 0 (stationary)'
    ELSE '⏳ NO NEW DATA - Trigger sync manually or wait for cron job (runs every 5 min)'
  END as deployment_status,
  'Check function logs if status is unclear' as note;


