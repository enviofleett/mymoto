-- Quick diagnostic: Check if toolbuxdev@gmail.com has admin role
-- Run this in Supabase SQL Editor

SELECT 
  u.id as user_id,
  u.email,
  u.created_at as user_created_at,
  ur.role,
  ur.created_at as role_created_at,
  p.id as profile_id,
  p.name as profile_name,
  CASE 
    WHEN ur.role = 'admin' THEN '✅ HAS ADMIN ROLE'
    WHEN ur.role IS NULL THEN '❌ NO ROLE ASSIGNED'
    ELSE '❌ HAS ROLE BUT NOT ADMIN: ' || ur.role
  END as status
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE u.email = 'toolbuxdev@gmail.com';

-- If no admin role, run this to grant it:
-- (Replace USER_ID_HERE with the user_id from above)
/*
DO $$
DECLARE
  user_uuid UUID;
BEGIN
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;
  
  IF user_uuid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Admin role granted to toolbuxdev@gmail.com (user_id: %)', user_uuid;
  ELSE
    RAISE NOTICE 'User not found';
  END IF;
END $$;
*/
