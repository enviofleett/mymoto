-- Directory Categories Table
CREATE TABLE IF NOT EXISTS public.directory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    icon TEXT, -- Optional icon identifier
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_directory_categories_active ON public.directory_categories(is_active, display_order);

-- Enable RLS
ALTER TABLE public.directory_categories ENABLE ROW LEVEL SECURITY;

-- RLS: Admins manage, everyone reads active categories
DROP POLICY IF EXISTS "Anyone can read active categories" ON public.directory_categories;
CREATE POLICY "Anyone can read active categories"
    ON public.directory_categories FOR SELECT
    USING (is_active = true);

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
