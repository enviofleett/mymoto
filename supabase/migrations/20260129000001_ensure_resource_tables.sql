-- Ensure Resource Categories Table exists
CREATE TABLE IF NOT EXISTS public.resource_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT, -- Optional icon identifier
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure Resource Posts Table exists
CREATE TABLE IF NOT EXISTS public.resource_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.resource_categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL, -- Rich text content (HTML/JSON)
    featured_image_url TEXT, -- URL to featured image
    images JSONB DEFAULT '[]'::jsonb, -- Array of image URLs
    is_published BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add YouTube links support if not exists (from 20260122000002)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'resource_posts' AND column_name = 'youtube_links') THEN
        ALTER TABLE public.resource_posts ADD COLUMN youtube_links TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_resource_posts_category ON public.resource_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_resource_posts_published ON public.resource_posts(is_published);
CREATE INDEX IF NOT EXISTS idx_resource_posts_order ON public.resource_posts(display_order DESC);
CREATE INDEX IF NOT EXISTS idx_resource_categories_order ON public.resource_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_resource_posts_youtube_links ON public.resource_posts USING GIN (youtube_links);

-- Enable RLS
ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_posts ENABLE ROW LEVEL SECURITY;

-- Policies
-- We drop and recreate policies to ensure they are up to date and to avoid errors if they already exist

-- Resource Categories Policies
DROP POLICY IF EXISTS "Anyone can read resource categories" ON public.resource_categories;
CREATE POLICY "Anyone can read resource categories" ON public.resource_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert resource categories" ON public.resource_categories;
CREATE POLICY "Admins can insert resource categories" ON public.resource_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update resource categories" ON public.resource_categories;
CREATE POLICY "Admins can update resource categories" ON public.resource_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete resource categories" ON public.resource_categories;
CREATE POLICY "Admins can delete resource categories" ON public.resource_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Resource Posts Policies
DROP POLICY IF EXISTS "Anyone can read published resource posts" ON public.resource_posts;
CREATE POLICY "Anyone can read published resource posts" ON public.resource_posts FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Admins can read all resource posts" ON public.resource_posts;
CREATE POLICY "Admins can read all resource posts" ON public.resource_posts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert resource posts" ON public.resource_posts;
CREATE POLICY "Admins can insert resource posts" ON public.resource_posts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update resource posts" ON public.resource_posts;
CREATE POLICY "Admins can update resource posts" ON public.resource_posts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete resource posts" ON public.resource_posts;
CREATE POLICY "Admins can delete resource posts" ON public.resource_posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
