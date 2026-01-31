-- Migration: Restore get_vehicle_trips_optimized to read from vehicle_trips table (GPS51 source)
-- Description:
-- Fixes the RPC function to query the synced vehicle_trips table instead of
-- dynamically calculating trips from position_history.
--
-- CRITICAL: The previous migration (20260130160000) reverted this function to use
-- position_history which causes data mismatch with GPS51 platform because:
-- 1. sync-trips-incremental writes GPS51 trips to vehicle_trips with source='gps51'
-- 2. But the RPC was reading from position_history (calculated trips, not GPS51 data)
-- 3. This caused trips shown in UI to differ from GPS51 platform
--
-- This fix ensures 100% parity with GPS51 platform by reading from vehicle_trips
-- where source='gps51'.

DROP FUNCTION IF EXISTS get_vehicle_trips_optimized(TEXT, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_vehicle_trips_optimized(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 200,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  distance_km NUMERIC,
  duration_seconds INTEGER,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  max_speed NUMERIC,
  avg_speed NUMERIC,
  source TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vt.id,
    vt.device_id,
    vt.start_time,
    vt.end_time,
    vt.distance_km,
    vt.duration_seconds,
    vt.start_latitude,
    vt.start_longitude,
    vt.end_latitude,
    vt.end_longitude,
    vt.max_speed,
    vt.avg_speed,
    vt.source
  FROM vehicle_trips vt
  WHERE vt.device_id = p_device_id
    -- CRITICAL: Only return GPS51-sourced trips to match platform exactly
    AND vt.source = 'gps51'
    AND (p_start_date IS NULL OR vt.start_time >= p_start_date::timestamp with time zone)
    AND (p_end_date IS NULL OR vt.start_time < p_end_date::timestamp with time zone)
  ORDER BY vt.start_time DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION get_vehicle_trips_optimized IS
  'Returns trips from vehicle_trips table with source=gps51 for 100% GPS51 platform parity. '
  'Do NOT revert to position_history calculation - that breaks GPS51 data match.';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_vehicle_trips_optimized(TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_vehicle_trips_optimized(TEXT, INTEGER, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_vehicle_trips_optimized(TEXT, INTEGER, TEXT, TEXT) TO service_role;
