-- Fix Provider RLS Policies
-- Ensure RLS policies are correct for registration flow

-- Allow authenticated users to insert their own profile (for self-registration)
DROP POLICY IF EXISTS "Providers insert own profile" ON public.service_providers;
CREATE POLICY "Providers insert own profile"
    ON public.service_providers FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Allow admins to insert/update/delete everything in service_providers
DROP POLICY IF EXISTS "Admins manage providers" ON public.service_providers;
CREATE POLICY "Admins manage providers"
    ON public.service_providers FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix user_roles policies to ensure providers can read their own role
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
