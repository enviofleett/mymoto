-- Make toolbuxdev@gmail.com an admin (Safe version with error handling)
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  user_uuid UUID;
  role_exists BOOLEAN;
BEGIN
  -- Step 1: Find the user
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;

  -- Check if user exists
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User toolbuxdev@gmail.com not found in auth.users. Please create the user account first or check the email spelling.';
  END IF;

  RAISE NOTICE 'Found user: toolbuxdev@gmail.com (ID: %)', user_uuid;

  -- Step 2: Check if admin role already exists
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = user_uuid AND role = 'admin'
  ) INTO role_exists;

  IF role_exists THEN
    RAISE NOTICE 'Admin role already exists for this user. No changes needed.';
  ELSE
    -- Step 3: Remove any existing non-admin roles (cleanup)
    DELETE FROM public.user_roles
    WHERE user_id = user_uuid AND role != 'admin';

    -- Step 4: Insert admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE '✓ Admin role assigned successfully!';
  END IF;

  -- Step 5: Verify
  SELECT public.has_role(user_uuid, 'admin') INTO role_exists;
  
  IF role_exists THEN
    RAISE NOTICE '✓ Verification passed: User has admin role';
  ELSE
    RAISE WARNING '✗ Verification failed: Admin role check returned false';
  END IF;

END $$;

-- Final verification query
SELECT 
  u.email,
  u.id as user_id,
  u.created_at as user_created_at,
  ur.role,
  ur.created_at as role_assigned_at,
  public.has_role(u.id, 'admin') as is_admin,
  CASE 
    WHEN public.has_role(u.id, 'admin') THEN '✅ ADMIN ACCESS GRANTED'
    ELSE '❌ NOT AN ADMIN'
  END as status
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id AND ur.role = 'admin'
WHERE u.email = 'toolbuxdev@gmail.com';
