CREATE OR REPLACE FUNCTION debug_find_vehicle(reg_num text)
RETURNS TABLE (
  device_id text,
  device_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.device_id,
    v.device_name,
    v.created_at
  FROM vehicles v
  WHERE v.device_name ILIKE '%' || reg_num || '%'
     OR v.device_id ILIKE '%' || reg_num || '%';
END;
$$;
