-- ============================================================================
-- GRANT ADMIN ACCESS TO ADMIN USERS
-- ============================================================================
-- Run this script in Supabase SQL Editor to grant admin access to
-- toolbux@gmail.com and other admin users
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
  ELSE
    RAISE NOTICE 'User toolbux@gmail.com not found';
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
  ELSE
    RAISE NOTICE 'User toolbuxdev@gmail.com not found';
  END IF;
END $$;

-- 3. Ensure RLS policies allow admins to manage service providers
-- Drop and recreate to ensure they're correct
DROP POLICY IF EXISTS "Admins manage providers" ON public.service_providers;
CREATE POLICY "Admins manage providers"
ON public.service_providers FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Ensure admins can manage directory_categories
DROP POLICY IF EXISTS "Admins insert categories" ON public.directory_categories;
CREATE POLICY "Admins insert categories"
ON public.directory_categories FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update categories" ON public.directory_categories;
CREATE POLICY "Admins update categories"
ON public.directory_categories FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete categories" ON public.directory_categories;
CREATE POLICY "Admins delete categories"
ON public.directory_categories FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Ensure admins can manage directory_bookings (for admin oversight)
DROP POLICY IF EXISTS "Admins manage all bookings" ON public.directory_bookings;
CREATE POLICY "Admins manage all bookings"
ON public.directory_bookings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Ensure admins can manage provider_ratings (for admin oversight)
DROP POLICY IF EXISTS "Admins read all ratings" ON public.provider_ratings;
CREATE POLICY "Admins read all ratings"
ON public.provider_ratings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify admin access:

-- Check all admin users:
-- SELECT u.email, ur.role, u.created_at
-- FROM auth.users u
-- JOIN public.user_roles ur ON u.id = ur.user_id
-- WHERE ur.role = 'admin'
-- ORDER BY u.created_at DESC;

-- Check if toolbux@gmail.com has admin role:
-- SELECT u.email, ur.role 
-- FROM auth.users u
-- JOIN public.user_roles ur ON u.id = ur.user_id
-- WHERE u.email = 'toolbux@gmail.com' AND ur.role = 'admin';

-- Test admin access to service_providers:
-- SELECT COUNT(*) as total_providers
-- FROM public.service_providers;
-- (Should work if you're logged in as admin)

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
