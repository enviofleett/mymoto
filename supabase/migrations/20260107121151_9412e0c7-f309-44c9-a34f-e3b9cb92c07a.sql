-- Create profiles table for driver/personnel information
CREATE TABLE public.profiles (
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
CREATE TABLE public.vehicle_assignments (
    device_id TEXT PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    vehicle_alias TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Authenticated users can read profiles" 
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert profiles" 
ON public.profiles FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update profiles" 
ON public.profiles FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles" 
ON public.profiles FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

-- Vehicle assignments RLS policies
CREATE POLICY "Authenticated users can read assignments" 
ON public.vehicle_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert assignments" 
ON public.vehicle_assignments FOR INSERT TO authenticated 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update assignments" 
ON public.vehicle_assignments FOR UPDATE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assignments" 
ON public.vehicle_assignments FOR DELETE TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));