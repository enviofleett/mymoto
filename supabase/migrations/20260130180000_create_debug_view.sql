-- Create a debug view to inspect providers and users
CREATE OR REPLACE VIEW public.debug_providers_view AS
SELECT 
    sp.id as provider_id,
    sp.business_name,
    sp.approval_status,
    u.id as user_id,
    u.email,
    u.raw_user_meta_data,
    u.created_at as user_created_at
FROM auth.users u
LEFT JOIN public.service_providers sp ON u.id = sp.user_id
WHERE u.raw_user_meta_data->>'role' = 'service_provider'
ORDER BY u.created_at DESC;

-- Grant access to anon (temporarily for debugging)
GRANT SELECT ON public.debug_providers_view TO anon;
GRANT SELECT ON public.debug_providers_view TO authenticated;
GRANT SELECT ON public.debug_providers_view TO service_role;
