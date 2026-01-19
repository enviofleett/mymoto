-- Diagnose Why Confidence Data Isn't Being Populated
-- Run these queries to identify the root cause

-- ============================================================================
-- 1. Check when edge function last ran (via cached_at timestamps)
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  MIN(cached_at) as oldest_cached,
  MAX(cached_at) as newest_cached,
  COUNT(CASE WHEN cached_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as cached_last_hour,
  COUNT(CASE WHEN cached_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as cached_last_24h,
  COUNT(CASE WHEN cached_at < NOW() - INTERVAL '24 hours' THEN 1 END) as stale_positions
FROM vehicle_positions;

-- ============================================================================
-- 2. Check if confidence columns exist but are NULL
-- ============================================================================
SELECT 
  COUNT(*) as total,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method,
  COUNT(CASE WHEN ignition_confidence IS NULL AND ignition_detection_method IS NULL THEN 1 END) as both_null,
  COUNT(CASE WHEN ignition_confidence IS NOT NULL OR ignition_detection_method IS NOT NULL THEN 1 END) as has_any
FROM vehicle_positions;

-- ============================================================================
-- 3. Check position_history - when were records last inserted?
-- ============================================================================
SELECT 
  COUNT(*) as total,
  MIN(recorded_at) as earliest_record,
  MAX(recorded_at) as latest_record,
  COUNT(CASE WHEN recorded_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as recorded_last_hour,
  COUNT(CASE WHEN recorded_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as recorded_last_24h,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method
FROM position_history;

-- ============================================================================
-- 4. Check for data quality issues (future dates, etc.)
-- ============================================================================
SELECT 
  'position_history' as table_name,
  COUNT(*) as total,
  COUNT(CASE WHEN gps_time > NOW() THEN 1 END) as future_dates,
  COUNT(CASE WHEN gps_time < '2020-01-01' THEN 1 END) as very_old_dates,
  MIN(gps_time) as earliest_gps_time,
  MAX(gps_time) as latest_gps_time
FROM position_history

UNION ALL

SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) as total,
  COUNT(CASE WHEN gps_time > NOW() THEN 1 END) as future_dates,
  COUNT(CASE WHEN gps_time < '2020-01-01' THEN 1 END) as very_old_dates,
  MIN(gps_time) as earliest_gps_time,
  MAX(gps_time) as latest_gps_time
FROM vehicle_positions;

-- ============================================================================
-- 5. Sample recent positions to see what data looks like
-- ============================================================================
SELECT 
  device_id,
  gps_time,
  cached_at,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  battery_percent,
  CASE 
    WHEN cached_at >= NOW() - INTERVAL '1 hour' THEN 'Recent'
    WHEN cached_at >= NOW() - INTERVAL '24 hours' THEN 'Today'
    ELSE 'Stale'
  END as freshness
FROM vehicle_positions
ORDER BY cached_at DESC
LIMIT 20;

-- ============================================================================
-- 6. Check if edge function is writing confidence (recent inserts)
-- ============================================================================
-- This shows positions that were updated AFTER the migration was applied
-- If confidence is still NULL, the normalizer might not be returning values
SELECT 
  device_id,
  cached_at,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  CASE 
    WHEN ignition_confidence IS NULL THEN '❌ No confidence (normalizer may not be returning values)'
    WHEN ignition_confidence IS NOT NULL THEN '✅ Has confidence'
    ELSE 'Unknown'
  END as status
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '24 hours'
ORDER BY cached_at DESC
LIMIT 20;
