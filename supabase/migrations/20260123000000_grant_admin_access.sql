-- ============================================================================
-- GRANT ADMIN ACCESS TO ADMIN USERS
-- ============================================================================
-- This migration ensures toolbux@gmail.com and other admin users have
-- admin role access to manage all features including service providers
-- ============================================================================

-- 1. Update the trigger function to auto-assign admin role to admin emails
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-assign admin role to admin email addresses
  IF NEW.email IN ('toolbux@gmail.com', 'toolbuxdev@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Default to user role for all other users
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Grant admin role to existing users with admin emails
-- This ensures existing users get admin access immediately
DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Grant admin to toolbux@gmail.com if exists
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'toolbux@gmail.com'
  LIMIT 1;
  
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Granted admin role to toolbux@gmail.com (user_id: %)', admin_user_id;
  END IF;
  
  -- Grant admin to toolbuxdev@gmail.com if exists
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;
  
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Granted admin role to toolbuxdev@gmail.com (user_id: %)', admin_user_id;
  END IF;
END $$;

-- 3. Verify RLS policies allow admins to manage service providers
-- (These should already exist from DEPLOY_DIRECTORY_MIGRATIONS.sql, but we'll ensure they're correct)

-- Ensure admins can manage service_providers (INSERT, UPDATE, DELETE)
DO $$
BEGIN
  -- Check if the policy exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'service_providers' 
    AND policyname = 'Admins manage providers'
  ) THEN
    CREATE POLICY "Admins manage providers"
    ON public.service_providers FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins manage providers" policy';
  ELSE
    RAISE NOTICE 'Policy "Admins manage providers" already exists';
  END IF;
END $$;

-- Ensure admins can manage directory_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'directory_categories' 
    AND policyname = 'Admins insert categories'
  ) THEN
    CREATE POLICY "Admins insert categories"
    ON public.directory_categories FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins insert categories" policy';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'directory_categories' 
    AND policyname = 'Admins update categories'
  ) THEN
    CREATE POLICY "Admins update categories"
    ON public.directory_categories FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins update categories" policy';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'directory_categories' 
    AND policyname = 'Admins delete categories'
  ) THEN
    CREATE POLICY "Admins delete categories"
    ON public.directory_categories FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins delete categories" policy';
  END IF;
END $$;

-- Ensure admins can manage directory_bookings (for admin oversight)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'directory_bookings' 
    AND policyname = 'Admins manage all bookings'
  ) THEN
    CREATE POLICY "Admins manage all bookings"
    ON public.directory_bookings FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins manage all bookings" policy';
  END IF;
END $$;

-- Ensure admins can manage provider_ratings (for admin oversight)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'provider_ratings' 
    AND policyname = 'Admins read all ratings'
  ) THEN
    CREATE POLICY "Admins read all ratings"
    ON public.provider_ratings FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
    
    RAISE NOTICE 'Created "Admins read all ratings" policy';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify admin access:

-- Check admin users:
-- SELECT u.email, ur.role 
-- FROM auth.users u
-- JOIN public.user_roles ur ON u.id = ur.user_id
-- WHERE ur.role = 'admin';

-- Check if toolbux@gmail.com has admin role:
-- SELECT u.email, ur.role 
-- FROM auth.users u
-- JOIN public.user_roles ur ON u.id = ur.user_id
-- WHERE u.email = 'toolbux@gmail.com' AND ur.role = 'admin';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
