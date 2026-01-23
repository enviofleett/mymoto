-- Grant admin role to user: 586a8e9b-88ab-4a83-bd6e-a3d7a451930b
-- This user is getting 401 errors when trying to update bonus

DO $$
DECLARE
  user_uuid UUID := '586a8e9b-88ab-4a83-bd6e-a3d7a451930b';
  user_email TEXT;
  admin_role_exists BOOLEAN;
BEGIN
  -- Get user email
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_uuid;
  
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User with ID % not found', user_uuid;
  END IF;
  
  RAISE NOTICE 'Found user: % (email: %)', user_uuid, user_email;
  
  -- Check if admin role exists
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = 'admin'
  ) INTO admin_role_exists;
  
  IF NOT admin_role_exists THEN
    -- Grant admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE '✓ Admin role granted successfully';
  ELSE
    RAISE NOTICE '✓ Admin role already exists';
  END IF;
  
  -- Verify
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = 'admin'
  ) INTO admin_role_exists;
  
  IF admin_role_exists THEN
    RAISE NOTICE '✅ VERIFICATION PASSED: User has admin role';
  ELSE
    RAISE WARNING '❌ VERIFICATION FAILED: Admin role not found';
  END IF;
END $$;
