-- Verification Queries for Ignition Detection Implementation
-- Run these in Supabase SQL Editor to verify current state
--
-- IMPORTANT: Some queries may fail if migrations haven't been run.
-- If you get column errors, first run CHECK_COLUMNS_EXIST.sql to see what's missing.
-- Then apply the appropriate migrations:
--   - supabase/migrations/20260118051409_add_ignition_confidence.sql (for position_history)
--   - supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql (for vehicle_positions)
--   - supabase/migrations/20260118051247_create_acc_state_history.sql (for acc_state_history)
--
-- IMPORTANT: Some queries may fail if migrations haven't been run.
-- If you get column errors, first run CHECK_COLUMNS_EXIST.sql to see what's missing.
-- Then apply the appropriate migrations:
--   - supabase/migrations/20260118051409_add_ignition_confidence.sql (for position_history)
--   - supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql (for vehicle_positions)
--   - supabase/migrations/20260118051247_create_acc_state_history.sql (for acc_state_history)

-- ============================================================================
-- 1. Check if confidence scores are being populated (ULTRA-OPTIMIZED: Last 6 hours)
-- ============================================================================
SELECT 
  COUNT(*) as total_positions,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method,
  ROUND(COUNT(ignition_confidence)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as confidence_population_percent,
  ROUND(COUNT(ignition_detection_method)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as method_population_percent
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
LIMIT 50000;  -- Safety limit

-- ============================================================================
-- 2. Check detection method distribution (ULTRA-OPTIMIZED: Last 6 hours)
-- ============================================================================
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence,
  ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 2) as percentage
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
  AND ignition_detection_method IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC
LIMIT 20;  -- Limit results

-- ============================================================================
-- 3. Check ACC state history population (ULTRA-OPTIMIZED: Last 7 days)
-- ============================================================================
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT device_id) as unique_devices,
  MIN(begin_time) as earliest_record,
  MAX(begin_time) as latest_record,
  COUNT(CASE WHEN source = 'gps51_api' THEN 1 END) as gps51_api_records,
  COUNT(CASE WHEN source = 'inferred' THEN 1 END) as inferred_records
FROM acc_state_history
WHERE begin_time >= NOW() - INTERVAL '7 days'  -- Only check last 7 days
LIMIT 10000;  -- Safety limit

-- ============================================================================
-- 4. Check recent ACC state changes (ULTRA-OPTIMIZED: Last 6 hours)
-- ============================================================================
SELECT 
  device_id,
  acc_state,
  begin_time,
  end_time,
  source,
  ROUND(EXTRACT(EPOCH FROM (end_time - begin_time)) / 60, 2) as duration_minutes
FROM acc_state_history
WHERE begin_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
ORDER BY begin_time DESC
LIMIT 20;

-- ============================================================================
-- 5. Check ignition detection quality (OPTIMIZED: Limited sample size)
-- ============================================================================
-- Note: If you want to use the function instead, first run:
-- supabase/migrations/20260118051442_monitoring_functions.sql
-- Then you can use: SELECT * FROM check_ignition_detection_quality(24)
-- 
-- OPTIMIZATION: This query now samples from recent data only and limits results
WITH recent_positions AS (
  -- Sample from recent positions only (last 6 hours, max 100k rows)
  SELECT 
    ph.device_id,
    ph.ignition_detection_method,
    ph.ignition_confidence,
    ph.ignition_on
  FROM position_history ph
  WHERE ph.gps_time >= NOW() - INTERVAL '6 hours'  -- Reduced from 24h to 6h
    AND ph.ignition_confidence IS NOT NULL
    AND ph.ignition_detection_method IS NOT NULL
  LIMIT 100000  -- Limit sample size to prevent timeout
),
detection_stats AS (
  SELECT 
    device_id,
    ignition_detection_method,
    COUNT(*) as method_count,
    AVG(ignition_confidence) as method_avg_confidence,
    SUM(CASE WHEN ignition_on = true THEN 1 ELSE 0 END) as on_count,
    SUM(CASE WHEN ignition_on = false THEN 1 ELSE 0 END) as off_count
  FROM recent_positions
  GROUP BY device_id, ignition_detection_method
),
device_totals AS (
  SELECT 
    device_id,
    SUM(method_count) as total_count,
    SUM(on_count) as total_on,
    SUM(off_count) as total_off
  FROM detection_stats
  GROUP BY device_id
)
SELECT 
  ds.device_id,
  dt.total_count::BIGINT as sample_count,
  ROUND(AVG(ds.method_avg_confidence)::NUMERIC, 3) as avg_confidence,
  ds.ignition_detection_method::TEXT as detection_method,
  ds.method_count::BIGINT as method_count,
  ROUND((ds.method_count::NUMERIC / NULLIF(dt.total_count, 0) * 100)::NUMERIC, 2) as method_percentage,
  ds.on_count::BIGINT as ignition_on_count,
  ds.off_count::BIGINT as ignition_off_count,
  ROUND((dt.total_on::NUMERIC / NULLIF(dt.total_count, 0) * 100)::NUMERIC, 2) as ignition_on_percentage
FROM detection_stats ds
JOIN device_totals dt ON ds.device_id = dt.device_id
GROUP BY 
  ds.device_id, 
  ds.ignition_detection_method, 
  ds.method_count,
  ds.on_count,
  ds.off_count,
  dt.total_count,
  dt.total_on,
  dt.total_off
ORDER BY ds.device_id, ds.method_count DESC
LIMIT 50;  -- Reduced from 100 to 50

-- ============================================================================
-- 6. Check vehicle_positions table (current state)
-- ============================================================================
-- Note: ignition_confidence columns may not exist if migration hasn't been run
-- Run: supabase/migrations/20260120000009_add_ignition_confidence_to_vehicle_positions.sql
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(CASE WHEN ignition_on = true THEN 1 END) as ignition_on_count,
  COUNT(CASE WHEN ignition_on = false THEN 1 END) as ignition_off_count,
  COUNT(CASE WHEN ignition_on IS NULL THEN 1 END) as ignition_null_count
FROM vehicle_positions
WHERE gps_time >= NOW() - INTERVAL '1 hour';

-- Check if confidence columns exist (run separately if needed)
-- If columns exist, this will show confidence data:
SELECT 
  COUNT(*) as total_vehicles,
  COUNT(ignition_confidence) as with_confidence,
  COUNT(ignition_detection_method) as with_method,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM vehicle_positions
WHERE gps_time >= NOW() - INTERVAL '1 hour'
  AND ignition_confidence IS NOT NULL;

-- ============================================================================
-- 7. Sample recent position data with detection details
-- ============================================================================
SELECT 
  device_id,
  gps_time,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  battery_percent
FROM position_history
WHERE gps_time >= NOW() - INTERVAL '1 hour'
  AND ignition_detection_method IS NOT NULL
ORDER BY gps_time DESC
LIMIT 20;
