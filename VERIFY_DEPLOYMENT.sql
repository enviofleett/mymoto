-- ============================================================================
-- Quick Deployment Verification
-- Run this after deploying the telemetry normalizer
-- ============================================================================

-- Quick check: Any speeds > 200?
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vehicle_positions WHERE speed > 200
      UNION ALL
      SELECT 1 FROM position_history 
      WHERE speed > 200 
      AND gps_time >= NOW() - INTERVAL '1 hour'
    ) THEN '❌ STILL NOT NORMALIZED - Found speeds > 200 (m/h)'
    ELSE '✅ NORMALIZED - All speeds ≤ 200 (km/h)'
  END as deployment_status,
  'Wait 1-2 minutes for new data to sync, then check again' as note;

-- Check recent data (last hour)
SELECT 
  'Recent Data Check (Last Hour)' as check_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE speed > 200) as non_normalized_count,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_count,
  ROUND(AVG(speed)::numeric, 2) as avg_speed,
  MAX(speed) as max_speed,
  CASE 
    WHEN MAX(speed) > 200 THEN '❌ Still has m/h values'
    WHEN MAX(speed) <= 200 AND MAX(speed) > 0 THEN '✅ Normalized to km/h'
    ELSE 'All stationary or no data'
  END as status
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour';

-- Check current vehicle positions
SELECT 
  'Current Vehicle Positions' as check_name,
  COUNT(*) as total_vehicles,
  COUNT(*) FILTER (WHERE speed > 200) as non_normalized_count,
  COUNT(*) FILTER (WHERE speed > 0 AND speed <= 200) as normalized_count,
  ROUND(AVG(speed)::numeric, 2) as avg_speed,
  MAX(speed) as max_speed,
  CASE 
    WHEN MAX(speed) > 200 THEN '❌ Still has m/h values'
    WHEN MAX(speed) <= 200 AND MAX(speed) > 0 THEN '✅ Normalized to km/h'
    ELSE 'All stationary or no data'
  END as status
FROM vehicle_positions;


