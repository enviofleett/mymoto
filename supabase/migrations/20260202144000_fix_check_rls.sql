DROP FUNCTION IF EXISTS debug_check_rls_policies(text);

CREATE OR REPLACE FUNCTION debug_check_rls_policies(table_name text)
RETURNS TABLE (
  policy_name text,
  command text,
  using_expression text,
  check_expression text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.policyname::text,
    p.cmd::text,
    p.qual::text,
    p.with_check::text
  FROM pg_policies p
  WHERE p.tablename = table_name;
END;
$$;

GRANT EXECUTE ON FUNCTION debug_check_rls_policies(text) TO anon;
GRANT EXECUTE ON FUNCTION debug_check_rls_policies(text) TO authenticated;
GRANT EXECUTE ON FUNCTION debug_check_rls_policies(text) TO service_role;
