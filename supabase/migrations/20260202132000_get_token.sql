
CREATE OR REPLACE FUNCTION debug_get_gps_token()
RETURNS TABLE (
  value text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.value, s.metadata
  FROM app_settings s
  WHERE s.key = 'gps_token';
END;
$$;
