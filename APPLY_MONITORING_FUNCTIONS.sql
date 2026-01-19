-- Apply Monitoring Functions Migration
-- Run this if check_ignition_detection_quality function doesn't exist
-- This is the same as: supabase/migrations/20260118051442_monitoring_functions.sql

-- ============================================================================
-- Function 1: Check Ignition Detection Quality
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_ignition_detection_quality(hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
  device_id TEXT,
  sample_count BIGINT,
  avg_confidence NUMERIC,
  detection_method TEXT,
  method_count BIGINT,
  method_percentage NUMERIC,
  ignition_on_count BIGINT,
  ignition_off_count BIGINT,
  ignition_on_percentage NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH detection_stats AS (
    SELECT 
      ph.device_id,
      ph.ignition_detection_method,
      COUNT(*) as method_count,
      AVG(ph.ignition_confidence) as method_avg_confidence,
      SUM(CASE WHEN ph.ignition_on = true THEN 1 ELSE 0 END) as on_count,
      SUM(CASE WHEN ph.ignition_on = false THEN 1 ELSE 0 END) as off_count
    FROM position_history ph
    WHERE ph.gps_time >= NOW() - (hours_back || ' hours')::INTERVAL
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
END;
$$;

COMMENT ON FUNCTION public.check_ignition_detection_quality IS 'Returns ignition detection quality metrics grouped by device and detection method';
