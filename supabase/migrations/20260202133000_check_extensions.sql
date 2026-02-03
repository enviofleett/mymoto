
CREATE OR REPLACE FUNCTION debug_check_extensions()
RETURNS TABLE (
  name text,
  version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT extname::text, extversion::text
  FROM pg_extension
  WHERE extname IN ('pg_net', 'http');
END;
$$;
