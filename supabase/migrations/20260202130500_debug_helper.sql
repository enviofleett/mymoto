-- Debug helper to check vehicle_trips data ignoring RLS

CREATE OR REPLACE FUNCTION debug_check_trips(p_device_id TEXT)
RETURNS TABLE (
  total_count bigint, 
  sources text[], 
  min_date timestamptz, 
  max_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    count(*), 
    array_agg(DISTINCT source), 
    min(start_time), 
    max(start_time)
  FROM vehicle_trips 
  WHERE device_id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_check_trips(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION debug_check_trips(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION debug_check_trips(TEXT) TO service_role;
