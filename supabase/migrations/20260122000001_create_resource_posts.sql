-- Resource Categories Table
CREATE TABLE IF NOT EXISTS public.resource_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT, -- Optional icon identifier
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Resource Posts Table
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

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_resource_posts_category ON public.resource_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_resource_posts_published ON public.resource_posts(is_published);
CREATE INDEX IF NOT EXISTS idx_resource_posts_order ON public.resource_posts(display_order DESC);
CREATE INDEX IF NOT EXISTS idx_resource_categories_order ON public.resource_categories(display_order);

-- Enable RLS
ALTER TABLE public.resource_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_posts ENABLE ROW LEVEL SECURITY;

-- Resource Categories Policies
-- Everyone can read published categories
DROP POLICY IF EXISTS "Anyone can read resource categories" ON public.resource_categories;
CREATE POLICY "Anyone can read resource categories"
    ON public.resource_categories FOR SELECT
    USING (true);

-- Only admins can manage categories
DROP POLICY IF EXISTS "Admins can insert resource categories" ON public.resource_categories;
CREATE POLICY "Admins can insert resource categories"
    ON public.resource_categories FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update resource categories" ON public.resource_categories;
CREATE POLICY "Admins can update resource categories"
    ON public.resource_categories FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete resource categories" ON public.resource_categories;
CREATE POLICY "Admins can delete resource categories"
    ON public.resource_categories FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Resource Posts Policies
-- Everyone can read published posts
DROP POLICY IF EXISTS "Anyone can read published resource posts" ON public.resource_posts;
CREATE POLICY "Anyone can read published resource posts"
    ON public.resource_posts FOR SELECT
    USING (is_published = true);

-- Admins can read all posts (including unpublished)
DROP POLICY IF EXISTS "Admins can read all resource posts" ON public.resource_posts;
CREATE POLICY "Admins can read all resource posts"
    ON public.resource_posts FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can create posts
DROP POLICY IF EXISTS "Admins can insert resource posts" ON public.resource_posts;
CREATE POLICY "Admins can insert resource posts"
    ON public.resource_posts FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update posts
DROP POLICY IF EXISTS "Admins can update resource posts" ON public.resource_posts;
CREATE POLICY "Admins can update resource posts"
    ON public.resource_posts FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete posts
DROP POLICY IF EXISTS "Admins can delete resource posts" ON public.resource_posts;
CREATE POLICY "Admins can delete resource posts"
    ON public.resource_posts FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
