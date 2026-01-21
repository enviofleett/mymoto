-- Extend app_role enum to include 'provider' role
-- This migration is idempotent and safe to run multiple times

-- Check if PostGIS extension exists (needed for later migrations)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Extend app_role enum safely
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'provider' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'provider';
  END IF;
END $$;

-- Note: handle_new_user_role() function already defaults to 'user' role
-- Provider role will be assigned manually by admin, so no changes needed there

-- Add RLS policy for providers to view their own role
CREATE POLICY IF NOT EXISTS "Providers can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  AND role = 'provider'
);

COMMENT ON TYPE public.app_role IS 'User roles: admin, user, provider';
