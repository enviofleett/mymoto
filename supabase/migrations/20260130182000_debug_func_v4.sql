DROP FUNCTION IF EXISTS public.get_debug_providers();

CREATE OR REPLACE FUNCTION public.get_debug_providers()
RETURNS TABLE (
    provider_id UUID,
    business_name TEXT,
    approval_status TEXT,
    user_id UUID,
    email TEXT,
    raw_user_meta_data JSONB,
    user_created_at TIMESTAMPTZ,
    categories JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    cats JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name)) INTO cats FROM public.directory_categories;

    RETURN QUERY
    SELECT 
        sp.id,
        sp.business_name,
        sp.approval_status,
        u.id,
        u.email::TEXT,
        u.raw_user_meta_data,
        u.created_at,
        cats
    FROM auth.users u
    LEFT JOIN public.service_providers sp ON u.id = sp.user_id
    WHERE u.created_at > now() - interval '24 hours'
    ORDER BY u.created_at DESC;
END;
$$;
