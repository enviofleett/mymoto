-- Check if monitoring functions exist
-- Run this first to verify migrations have been applied

-- ============================================================================
-- Check if check_ignition_detection_quality function exists
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'check_ignition_detection_quality'
    ) THEN '✅ Function exists'
    ELSE '❌ Function does NOT exist - run migration: supabase/migrations/20260118051442_monitoring_functions.sql'
  END as function_status;

-- ============================================================================
-- Check function signature
-- ============================================================================
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'check_ignition_detection_quality';

-- ============================================================================
-- Alternative: Manual quality check (if function doesn't exist)
-- ============================================================================
-- This query does the same thing as the function, manually
WITH detection_stats AS (
  SELECT 
    ph.device_id,
    ph.ignition_detection_method,
    COUNT(*) as method_count,
    AVG(ph.ignition_confidence) as method_avg_confidence,
    SUM(CASE WHEN ph.ignition_on = true THEN 1 ELSE 0 END) as on_count,
    SUM(CASE WHEN ph.ignition_on = false THEN 1 ELSE 0 END) as off_count
  FROM position_history ph
  WHERE ph.gps_time >= NOW() - INTERVAL '24 hours'
    AND ph.ignition_confidence IS NOT NULL
    AND ph.ignition_detection_method IS NOT NULL
  GROUP BY ph.device_id, ph.ignition_detection_method
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
  ROUND((ds.method_count::NUMERIC / dt.total_count * 100)::NUMERIC, 2) as method_percentage,
  ds.on_count::BIGINT as ignition_on_count,
  ds.off_count::BIGINT as ignition_off_count,
  ROUND((dt.total_on::NUMERIC / dt.total_count * 100)::NUMERIC, 2) as ignition_on_percentage
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
ORDER BY ds.device_id, ds.method_count DESC;
