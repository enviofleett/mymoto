-- Debug helper to check ALL telemetry tables ignoring RLS

CREATE OR REPLACE FUNCTION debug_check_telemetry(p_device_id TEXT)
RETURNS TABLE (
  table_name text,
  record_count bigint,
  last_timestamp timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check vehicle_positions
  RETURN QUERY
  SELECT 
    'vehicle_positions'::text,
    count(*)::bigint,
    max(gps_time)
  FROM vehicle_positions
  WHERE device_id = p_device_id;

  -- Check position_history
  RETURN QUERY
  SELECT 
    'position_history'::text,
    count(*)::bigint,
    max(gps_time)
  FROM position_history
  WHERE device_id = p_device_id;

  -- Check vehicle_trips
  RETURN QUERY
  SELECT 
    'vehicle_trips'::text,
    count(*)::bigint,
    max(start_time)
  FROM vehicle_trips
  WHERE device_id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_check_telemetry(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION debug_check_telemetry(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION debug_check_telemetry(TEXT) TO service_role;
