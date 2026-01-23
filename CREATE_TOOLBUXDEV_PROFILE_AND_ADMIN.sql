-- ============================================================================
-- CREATE PROFILE AND GRANT ADMIN ACCESS FOR toolbuxdev@gmail.com
-- ============================================================================
-- This script will:
-- 1. Find the user_id for toolbuxdev@gmail.com
-- 2. Create a profile if it doesn't exist
-- 3. Grant admin role if it doesn't exist
-- ============================================================================

DO $$
DECLARE
  user_uuid UUID;
  profile_exists BOOLEAN;
  admin_role_exists BOOLEAN;
  profile_id_result UUID;
BEGIN
  -- Step 1: Find user by email
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User toolbuxdev@gmail.com not found in auth.users. User must sign up first.';
  END IF;
  
  RAISE NOTICE 'Found user: toolbuxdev@gmail.com (user_id: %)', user_uuid;
  
  -- Step 2: Check if profile exists
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE user_id = user_uuid
  ) INTO profile_exists;
  
  IF NOT profile_exists THEN
    -- Create profile
    INSERT INTO public.profiles (user_id, name, email, status)
    VALUES (
      user_uuid,
      'Toolbux Dev',
      'toolbuxdev@gmail.com',
      'active'
    )
    RETURNING id INTO profile_id_result;
    
    RAISE NOTICE '✓ Profile created successfully (profile_id: %)', profile_id_result;
  ELSE
    RAISE NOTICE '✓ Profile already exists for this user';
  END IF;
  
  -- Step 3: Check if admin role exists
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
    RAISE NOTICE '✓ Admin role already exists for this user';
  END IF;
  
  -- Step 4: Verification
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VERIFICATION:';
  RAISE NOTICE '========================================';
  
  -- Check profile
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE user_id = user_uuid
  ) INTO profile_exists;
  
  IF profile_exists THEN
    RAISE NOTICE '✓ Profile: EXISTS';
  ELSE
    RAISE WARNING '✗ Profile: MISSING';
  END IF;
  
  -- Check admin role
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = user_uuid AND role = 'admin'
  ) INTO admin_role_exists;
  
  IF admin_role_exists THEN
    RAISE NOTICE '✓ Admin Role: EXISTS';
  ELSE
    RAISE WARNING '✗ Admin Role: MISSING';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Setup complete for toolbuxdev@gmail.com';
  RAISE NOTICE '========================================';
  
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to double-check)
-- ============================================================================

-- Check profile and role:
-- SELECT 
--   u.email,
--   p.id as profile_id,
--   p.name as profile_name,
--   p.email as profile_email,
--   ur.role,
--   p.status
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON u.id = p.user_id
-- LEFT JOIN public.user_roles ur ON u.id = ur.user_id
-- WHERE u.email = 'toolbuxdev@gmail.com';

-- ============================================================================
