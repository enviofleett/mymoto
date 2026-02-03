CREATE OR REPLACE FUNCTION debug_get_columns(t_name text)
RETURNS TABLE (
  column_name text,
  data_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.column_name::text,
    c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_name = t_name;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_get_columns(text) TO anon;
GRANT EXECUTE ON FUNCTION debug_get_columns(text) TO authenticated;
GRANT EXECUTE ON FUNCTION debug_get_columns(text) TO service_role;
