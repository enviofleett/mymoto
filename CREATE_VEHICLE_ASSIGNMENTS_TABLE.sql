-- Create profiles and vehicle_assignments tables
-- Run this BEFORE running the RLS policy migration (20260114000003)

-- Create profiles table for driver/personnel information
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    license_number TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave'))
);

-- Create vehicle_assignments table to link GPS51 devices to profiles
CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
    device_id TEXT PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    vehicle_alias TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (will be recreated if needed)
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read assignments" ON public.vehicle_assignments;
DROP POLICY IF EXISTS "Admins can insert assignments" ON public.vehicle_assignments;
DROP POLICY IF EXISTS "Admins can update assignments" ON public.vehicle_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON public.vehicle_assignments;

-- Profiles RLS policies
CREATE POLICY "Authenticated users can read profiles" 
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert profiles" 
ON public.profiles FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update profiles" 
ON public.profiles FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete profiles" 
ON public.profiles FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Vehicle assignments RLS policies
CREATE POLICY "Authenticated users can read assignments" 
ON public.vehicle_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert assignments" 
ON public.vehicle_assignments FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update assignments" 
ON public.vehicle_assignments FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete assignments" 
ON public.vehicle_assignments FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can manage both tables (for edge functions)
CREATE POLICY "Service role can manage profiles"
ON public.profiles FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can manage assignments"
ON public.vehicle_assignments FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_profile_id ON public.vehicle_assignments(profile_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_device_id ON public.vehicle_assignments(device_id);
