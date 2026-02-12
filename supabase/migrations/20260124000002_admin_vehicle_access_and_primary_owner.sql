-- ============================================================================
-- ADMIN VEHICLE ACCESS & PRIMARY OWNER REQUIREMENT
-- ============================================================================
-- This migration ensures:
-- 1. Admins (including toolbuxdev@gmail.com) have access to ALL vehicles
-- 2. All vehicles MUST have a primary owner (admin or toolbuxdev@gmail.com)
-- 3. Vehicle registration automatically assigns primary owner
-- ============================================================================

-- Step 1: Add primary_owner_profile_id column to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS primary_owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_primary_owner 
ON public.vehicles(primary_owner_profile_id);

-- Step 2: Create function to get admin profile IDs (toolbuxdev@gmail.com + any admin users)
CREATE OR REPLACE FUNCTION public.get_admin_profile_ids()
RETURNS TABLE(profile_id UUID, user_email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id as profile_id, u.email as user_email
  FROM auth.users u
  JOIN public.profiles p ON p.user_id = u.id
  JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.role = 'admin'::app_role
     OR u.email = 'toolbuxdev@gmail.com';
$$;

-- Step 3: Create function to get or create primary admin profile
-- This ensures toolbuxdev@gmail.com profile exists
CREATE OR REPLACE FUNCTION public.ensure_primary_admin_profile()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_user_id UUID;
  admin_profile_id UUID;
BEGIN
  -- Find toolbuxdev@gmail.com user
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'toolbuxdev@gmail.com'
  LIMIT 1;
  
  IF admin_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get or create profile
  SELECT id INTO admin_profile_id
  FROM public.profiles
  WHERE user_id = admin_user_id
  LIMIT 1;
  
  IF admin_profile_id IS NULL THEN
    -- Create profile for toolbuxdev@gmail.com
    INSERT INTO public.profiles (user_id, name, email, status)
    VALUES (admin_user_id, 'Toolbux Dev', 'toolbuxdev@gmail.com', 'active')
    RETURNING id INTO admin_profile_id;
    
    RAISE NOTICE 'Created profile for toolbuxdev@gmail.com: %', admin_profile_id;
  END IF;
  
  -- Ensure admin role exists
  INSERT INTO public.user_roles (user_id, role)
  VALUES (admin_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN admin_profile_id;
END;
$$;

-- Step 4: Create trigger to ensure all vehicles have a primary owner
CREATE OR REPLACE FUNCTION public.ensure_vehicle_primary_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_admin_profile_id UUID;
BEGIN
  -- If vehicle doesn't have a primary owner, assign one
  IF NEW.primary_owner_profile_id IS NULL THEN
    -- Get the primary admin profile (toolbuxdev@gmail.com)
    SELECT ensure_primary_admin_profile() INTO primary_admin_profile_id;
    
    IF primary_admin_profile_id IS NOT NULL THEN
      NEW.primary_owner_profile_id := primary_admin_profile_id;
      RAISE NOTICE 'Assigned primary owner % to vehicle %', primary_admin_profile_id, NEW.device_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger BEFORE INSERT to ensure primary owner is set
DROP TRIGGER IF EXISTS ensure_vehicle_has_primary_owner_insert ON public.vehicles;
CREATE TRIGGER ensure_vehicle_has_primary_owner_insert
BEFORE INSERT ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_vehicle_primary_owner();

-- Create trigger BEFORE UPDATE to prevent NULL primary owner
DROP TRIGGER IF EXISTS ensure_vehicle_has_primary_owner_update ON public.vehicles;
CREATE TRIGGER ensure_vehicle_has_primary_owner_update
BEFORE UPDATE ON public.vehicles
FOR EACH ROW
WHEN (NEW.primary_owner_profile_id IS NULL)
EXECUTE FUNCTION public.ensure_vehicle_primary_owner();

-- Step 5: Update existing vehicles that don't have primary owner
DO $$
DECLARE
  primary_admin_profile_id UUID;
  vehicles_updated INTEGER;
BEGIN
  -- Get primary admin profile
  SELECT ensure_primary_admin_profile() INTO primary_admin_profile_id;
  
  IF primary_admin_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Update vehicles without primary owner
  UPDATE public.vehicles
  SET primary_owner_profile_id = primary_admin_profile_id
  WHERE primary_owner_profile_id IS NULL;
  
  GET DIAGNOSTICS vehicles_updated = ROW_COUNT;
  
  RAISE NOTICE 'Updated % vehicles with primary owner', vehicles_updated;
  
  -- Now that all vehicles have primary owners, we can add NOT NULL constraint
  -- But we'll do it in a separate step to avoid issues
END $$;

-- Step 6: Create constraint to ensure primary_owner_profile_id is never NULL
-- The trigger ensures new vehicles always have primary owner
-- After Step 5 updates all existing vehicles, we can safely add NOT NULL

-- Verify all vehicles have primary owners before adding constraint
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.vehicles
  WHERE primary_owner_profile_id IS NULL;
  
  IF null_count > 0 THEN
    RETURN;
  END IF;
  
  RAISE NOTICE 'All vehicles have primary owners. Adding NOT NULL constraint...';
  EXECUTE 'ALTER TABLE public.vehicles ALTER COLUMN primary_owner_profile_id SET NOT NULL';
END $$;

-- Step 7: Update RLS policies to allow admins to see all vehicles
-- Drop existing policies that might restrict admin access
DROP POLICY IF EXISTS "Users can view assigned vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;

-- Create new policy: Admins see all, users see assigned
CREATE POLICY "Users can view assigned vehicles, admins see all"
ON public.vehicles FOR SELECT
TO authenticated
USING (
  -- Admins can see all vehicles
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Users can see vehicles assigned to them
  EXISTS (
    SELECT 1
    FROM public.vehicle_assignments va
    JOIN public.profiles p ON p.id = va.profile_id
    WHERE va.device_id = vehicles.device_id
      AND p.user_id = auth.uid()
  )
  OR
  -- Users can see vehicles where they are primary owner
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = vehicles.primary_owner_profile_id
      AND p.user_id = auth.uid()
  )
);

-- Step 8: Update vehicle_assignments RLS to allow admins to see all assignments
DROP POLICY IF EXISTS "Authenticated users can read assignments" ON public.vehicle_assignments;
CREATE POLICY "Users can view their assignments, admins see all"
ON public.vehicle_assignments FOR SELECT
TO authenticated
USING (
  -- Admins can see all assignments
  public.has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Users can see their own assignments
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = vehicle_assignments.profile_id
      AND p.user_id = auth.uid()
  )
);

-- Step 9: Auto-create vehicle assignment for primary owner when vehicle is created
CREATE OR REPLACE FUNCTION public.auto_assign_primary_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure vehicle has primary owner assignment
  IF NEW.primary_owner_profile_id IS NOT NULL THEN
    INSERT INTO public.vehicle_assignments (device_id, profile_id, vehicle_alias)
    VALUES (NEW.device_id, NEW.primary_owner_profile_id, NEW.device_name)
    ON CONFLICT (device_id, profile_id) DO NOTHING;
    
    RAISE NOTICE 'Auto-assigned primary owner % to vehicle %', NEW.primary_owner_profile_id, NEW.device_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger AFTER INSERT to auto-assign primary owner
DROP TRIGGER IF EXISTS auto_assign_primary_owner_trigger ON public.vehicles;
CREATE TRIGGER auto_assign_primary_owner_trigger
AFTER INSERT ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_primary_owner();

-- Step 10: Update existing vehicles to ensure they have primary owner assignments
DO $$
DECLARE
  vehicle_record RECORD;
  assignment_count INTEGER;
BEGIN
  -- For each vehicle with a primary owner, ensure assignment exists
  FOR vehicle_record IN 
    SELECT device_id, primary_owner_profile_id, device_name
    FROM public.vehicles
    WHERE primary_owner_profile_id IS NOT NULL
  LOOP
    INSERT INTO public.vehicle_assignments (device_id, profile_id, vehicle_alias)
    VALUES (vehicle_record.device_id, vehicle_record.primary_owner_profile_id, vehicle_record.device_name)
    ON CONFLICT (device_id, profile_id) DO NOTHING;
  END LOOP;
  
  SELECT COUNT(*) INTO assignment_count
  FROM public.vehicle_assignments va
  JOIN public.vehicles v ON v.device_id = va.device_id
  WHERE va.profile_id = v.primary_owner_profile_id;
  
  RAISE NOTICE 'Ensured primary owner assignments exist for all vehicles. Total: %', assignment_count;
END $$;

-- Step 11: Add comments for documentation
COMMENT ON COLUMN public.vehicles.primary_owner_profile_id IS 
'Primary owner profile ID. Must be an admin user or toolbuxdev@gmail.com. All vehicles must have a primary owner.';

COMMENT ON FUNCTION public.get_admin_profile_ids() IS 
'Returns all admin profile IDs including toolbuxdev@gmail.com. Used for admin access checks.';

COMMENT ON FUNCTION public.ensure_primary_admin_profile() IS 
'Ensures toolbuxdev@gmail.com has a profile and admin role. Returns the profile ID.';

COMMENT ON FUNCTION public.ensure_vehicle_primary_owner() IS 
'Trigger function that ensures all vehicles have a primary owner assigned (admin or toolbuxdev@gmail.com).';

COMMENT ON FUNCTION public.auto_assign_primary_owner() IS 
'Trigger function that automatically creates vehicle_assignments entry for primary owner when vehicle is created.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify:

-- Check vehicles without primary owner (should be 0):
-- SELECT device_id, device_name, primary_owner_profile_id
-- FROM public.vehicles
-- WHERE primary_owner_profile_id IS NULL;

-- Check primary owner assignments:
-- SELECT v.device_id, v.device_name, p.name as primary_owner_name, p.email as primary_owner_email
-- FROM public.vehicles v
-- JOIN public.profiles p ON p.id = v.primary_owner_profile_id
-- ORDER BY v.device_id
-- LIMIT 10;

-- Check admin profile IDs:
-- SELECT * FROM public.get_admin_profile_ids();
