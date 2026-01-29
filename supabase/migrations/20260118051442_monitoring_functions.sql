-- Monitoring Functions for Ignition Detection Quality and Trip Accuracy
-- These functions provide visibility into detection quality and help identify issues

-- ============================================================================
-- Function 1: Check Ignition Detection Quality
-- ============================================================================
-- Returns average confidence, method distribution, and quality metrics
-- for the specified time period (hours back)

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

-- ============================================================================
-- Function 2: Compare Trip Sources
-- ============================================================================
-- Compares GPS51 trips vs local extracted trips for a device
-- Helps identify discrepancies and accuracy issues

CREATE OR REPLACE FUNCTION public.compare_trip_sources(
  p_device_id TEXT,
  days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  trip_date DATE,
  gps51_trips BIGINT,
  local_trips BIGINT,
  trip_difference INTEGER,
  gps51_total_distance NUMERIC,
  local_total_distance NUMERIC,
  distance_difference NUMERIC,
  accuracy TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH gps51_stats AS (
    SELECT 
      DATE(vt.start_time) as trip_date,
      COUNT(*) as trip_count,
      SUM(vt.distance_km) as total_distance
    FROM vehicle_trips vt
    WHERE vt.device_id = p_device_id
      AND vt.start_time >= NOW() - (days_back || ' days')::INTERVAL
      -- Note: Add source column to vehicle_trips to distinguish GPS51 vs local trips
      -- For now, we'll assume GPS51 trips (primary source)
    GROUP BY DATE(vt.start_time)
  ),
  position_stats AS (
    -- Count potential trips from position_history (simplified)
    SELECT 
      DATE(gps_time) as trip_date,
      COUNT(DISTINCT DATE_TRUNC('hour', gps_time)) as potential_trips
    FROM position_history
    WHERE device_id = p_device_id
      AND gps_time >= NOW() - (days_back || ' days')::INTERVAL
      AND ignition_on = true
      AND speed > 5 -- Moving
    GROUP BY DATE(gps_time)
  )
  SELECT 
    COALESCE(g.trip_date, p.trip_date) as trip_date,
    COALESCE(g.trip_count, 0)::BIGINT as gps51_trips,
    COALESCE(p.potential_trips, 0)::BIGINT as local_trips,
    (COALESCE(g.trip_count, 0) - COALESCE(p.potential_trips, 0))::INTEGER as trip_difference,
    ROUND(COALESCE(g.total_distance, 0)::NUMERIC, 2) as gps51_total_distance,
    0::NUMERIC as local_total_distance, -- Placeholder - would need actual local trip data
    ROUND(COALESCE(g.total_distance, 0)::NUMERIC, 2) as distance_difference,
    CASE 
      WHEN ABS(COALESCE(g.trip_count, 0) - COALESCE(p.potential_trips, 0)) <= 1 THEN 'MATCH'
      WHEN ABS(COALESCE(g.trip_count, 0) - COALESCE(p.potential_trips, 0)) <= 3 THEN 'CLOSE'
      ELSE 'MISMATCH'
    END::TEXT as accuracy
  FROM gps51_stats g
  FULL OUTER JOIN position_stats p ON g.trip_date = p.trip_date
  ORDER BY trip_date DESC;
END;
$$;

COMMENT ON FUNCTION public.compare_trip_sources IS 'Compares GPS51 trips vs local trip extraction for a device to identify discrepancies';

-- ============================================================================
-- Function 3: Get Low Confidence Devices
-- ============================================================================
-- Identifies devices with poor ignition detection quality
-- Useful for alerting and debugging

CREATE OR REPLACE FUNCTION public.get_low_confidence_devices(
  threshold NUMERIC DEFAULT 0.7,
  hours_back INTEGER DEFAULT 24,
  min_samples INTEGER DEFAULT 10
)
RETURNS TABLE (
  device_id TEXT,
  sample_count BIGINT,
  avg_confidence NUMERIC,
  min_confidence NUMERIC,
  max_confidence NUMERIC,
  primary_method TEXT,
  method_percentage NUMERIC,
  ignition_on_percentage NUMERIC,
  quality_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH method_counts AS (
    SELECT 
      ph.device_id,
      ph.ignition_detection_method,
      COUNT(*) as method_count
    FROM position_history ph
    WHERE ph.gps_time >= NOW() - (hours_back || ' hours')::INTERVAL
      AND ph.ignition_confidence IS NOT NULL
      AND ph.ignition_detection_method IS NOT NULL
    GROUP BY ph.device_id, ph.ignition_detection_method
  ),
  primary_methods AS (
    SELECT DISTINCT ON (device_id)
      device_id,
      ignition_detection_method as primary_method,
      method_count as total_count
    FROM method_counts
    ORDER BY device_id, method_count DESC
  ),
  device_stats AS (
    SELECT 
      ph.device_id,
      COUNT(*) as sample_count,
      ROUND(AVG(ph.ignition_confidence)::NUMERIC, 3) as avg_confidence,
      ROUND(MIN(ph.ignition_confidence)::NUMERIC, 3) as min_confidence,
      ROUND(MAX(ph.ignition_confidence)::NUMERIC, 3) as max_confidence,
      pm.primary_method,
      ROUND((pm.total_count::NUMERIC / COUNT(*) * 100)::NUMERIC, 2) as method_pct,
      ROUND((SUM(CASE WHEN ph.ignition_on = true THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100)::NUMERIC, 2) as on_pct
    FROM position_history ph
    JOIN primary_methods pm ON ph.device_id = pm.device_id
    WHERE ph.gps_time >= NOW() - (hours_back || ' hours')::INTERVAL
      AND ph.ignition_confidence IS NOT NULL
      AND ph.ignition_detection_method IS NOT NULL
    GROUP BY ph.device_id, pm.primary_method, pm.total_count
    HAVING COUNT(*) >= min_samples
  )
  SELECT 
    ds.device_id::TEXT,
    ds.sample_count::BIGINT,
    ds.avg_confidence,
    ds.min_confidence,
    ds.max_confidence,
    ds.primary_method::TEXT,
    ds.method_pct as method_percentage,
    ds.on_pct as ignition_on_percentage,
    CASE 
      WHEN ds.avg_confidence < threshold THEN 'LOW'
      WHEN ds.avg_confidence < (threshold + 0.1) THEN 'MARGINAL'
      ELSE 'GOOD'
    END::TEXT as quality_status
  FROM device_stats ds
  WHERE ds.avg_confidence < threshold OR ds.on_pct < 5 OR ds.on_pct > 95 -- Flag unrealistic distributions
  ORDER BY ds.avg_confidence ASC, ds.sample_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_low_confidence_devices IS 'Identifies devices with poor ignition detection quality below the specified threshold';

-- ============================================================================
-- View: Ignition Detection Summary (Daily)
-- ============================================================================
-- Provides daily summary of detection methods and confidence scores

CREATE OR REPLACE VIEW public.ignition_detection_summary AS
SELECT 
  DATE(ph.gps_time) as detection_date,
  ph.device_id,
  ph.ignition_detection_method,
  COUNT(*) as detection_count,
  ROUND(AVG(ph.ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ph.ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ph.ignition_confidence)::NUMERIC, 3) as max_confidence,
  SUM(CASE WHEN ph.ignition_on = true THEN 1 ELSE 0 END) as ignition_on_count,
  SUM(CASE WHEN ph.ignition_on = false THEN 1 ELSE 0 END) as ignition_off_count,
  ROUND((SUM(CASE WHEN ph.ignition_on = true THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100)::NUMERIC, 2) as ignition_on_percentage
FROM position_history ph
WHERE ph.ignition_confidence IS NOT NULL
  AND ph.ignition_detection_method IS NOT NULL
GROUP BY DATE(ph.gps_time), ph.device_id, ph.ignition_detection_method
ORDER BY detection_date DESC, device_id, detection_count DESC;

COMMENT ON VIEW public.ignition_detection_summary IS 'Daily summary of ignition detection methods and confidence scores per device';

-- Grant access to authenticated users
GRANT SELECT ON public.ignition_detection_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ignition_detection_quality TO authenticated;
GRANT EXECUTE ON FUNCTION public.compare_trip_sources TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_confidence_devices TO authenticated;
