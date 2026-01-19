-- Ensure toolbuxdev@gmail.com has admin role
-- This migration ensures the admin role is assigned even if the user was created before the trigger

DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Find the user by email
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;

  -- If user exists and doesn't have admin role, assign it
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Admin role ensured for toolbuxdev@gmail.com (user_id: %)', admin_user_id;
  ELSE
    RAISE NOTICE 'User toolbuxdev@gmail.com not found in auth.users';
  END IF;
END $$;
