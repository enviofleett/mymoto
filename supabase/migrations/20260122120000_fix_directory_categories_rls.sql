-- Fix RLS policies for directory_categories to allow admin inserts
DROP POLICY IF EXISTS "Admins manage categories" ON public.directory_categories;

-- Admins can insert categories
DROP POLICY IF EXISTS "Admins insert categories" ON public.directory_categories;
CREATE POLICY "Admins insert categories"
    ON public.directory_categories FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update categories
DROP POLICY IF EXISTS "Admins update categories" ON public.directory_categories;
CREATE POLICY "Admins update categories"
    ON public.directory_categories FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete categories
DROP POLICY IF EXISTS "Admins delete categories" ON public.directory_categories;
CREATE POLICY "Admins delete categories"
    ON public.directory_categories FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
