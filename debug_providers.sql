
-- Check recent auth.users and their metadata
SELECT 
    id, 
    email, 
    raw_user_meta_data, 
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Check recent service_providers
SELECT * 
FROM public.service_providers
ORDER BY created_at DESC
LIMIT 5;

-- Check if there are any users with role='service_provider' who don't have a service_providers record
SELECT 
    u.id as user_id, 
    u.email, 
    u.raw_user_meta_data->>'business_name' as business_name,
    u.created_at
FROM auth.users u
LEFT JOIN public.service_providers sp ON u.id = sp.user_id
WHERE u.raw_user_meta_data->>'role' = 'service_provider'
  AND sp.id IS NULL;
