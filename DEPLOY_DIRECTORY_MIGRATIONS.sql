-- ============================================================================
-- DEPLOY DIRECTORY SERVICE MIGRATIONS
-- ============================================================================
-- This file contains all migrations needed for the Directory Service feature
-- Run this in your Supabase SQL Editor to set up the directory system
-- ============================================================================

-- 1. Extend app_role enum to include service_provider
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'service_provider' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
    ) THEN
        ALTER TYPE public.app_role ADD VALUE 'service_provider';
    END IF;
END $$;

-- 2. Create Directory Categories Table
CREATE TABLE IF NOT EXISTS public.directory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    icon TEXT, -- Optional icon identifier
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for directory_categories
CREATE INDEX IF NOT EXISTS idx_directory_categories_active ON public.directory_categories(is_active, display_order);

-- Enable RLS
ALTER TABLE public.directory_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for directory_categories
DROP POLICY IF EXISTS "Anyone can read active categories" ON public.directory_categories;
CREATE POLICY "Anyone can read active categories"
    ON public.directory_categories FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.directory_categories;
DROP POLICY IF EXISTS "Admins insert categories" ON public.directory_categories;
DROP POLICY IF EXISTS "Admins update categories" ON public.directory_categories;
DROP POLICY IF EXISTS "Admins delete categories" ON public.directory_categories;

-- Admins can insert categories
CREATE POLICY "Admins insert categories"
    ON public.directory_categories FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update categories
CREATE POLICY "Admins update categories"
    ON public.directory_categories FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete categories
CREATE POLICY "Admins delete categories"
    ON public.directory_categories FOR DELETE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- 3. Create Service Providers Table
CREATE TABLE IF NOT EXISTS public.service_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    category_id UUID REFERENCES public.directory_categories(id) ON DELETE SET NULL,
    
    -- Business Info
    business_name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    
    -- Profile Data (JSONB for flexibility)
    profile_data JSONB DEFAULT '{}'::jsonb,
    
    -- Approval Workflow
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'needs_reapproval')),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    rejection_reason TEXT,
    
    -- Edit Tracking
    pending_changes JSONB, -- Stores unapproved edits
    last_edit_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for service_providers
CREATE INDEX IF NOT EXISTS idx_service_providers_user ON public.service_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_category ON public.service_providers(category_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_status ON public.service_providers(approval_status);
CREATE INDEX IF NOT EXISTS idx_service_providers_approved ON public.service_providers(approval_status, approved_at) 
    WHERE approval_status = 'approved';

-- RLS Policies for service_providers
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers read own profile" ON public.service_providers;
DROP POLICY IF EXISTS "Users read approved providers" ON public.service_providers;
DROP POLICY IF EXISTS "Admins read all providers" ON public.service_providers;
DROP POLICY IF EXISTS "Providers update own profile" ON public.service_providers;
DROP POLICY IF EXISTS "Providers insert own profile" ON public.service_providers;
DROP POLICY IF EXISTS "Admins manage providers" ON public.service_providers;

-- Providers can read their own profile
CREATE POLICY "Providers read own profile"
    ON public.service_providers FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can read approved providers only
CREATE POLICY "Users read approved providers"
    ON public.service_providers FOR SELECT
    TO authenticated
    USING (approval_status = 'approved');

-- Admins can read all
CREATE POLICY "Admins read all providers"
    ON public.service_providers FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Providers can update their own profile (triggers needs_reapproval)
CREATE POLICY "Providers update own profile"
    ON public.service_providers FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Providers can insert their own profile (during signup)
CREATE POLICY "Providers insert own profile"
    ON public.service_providers FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Admins can manage all
CREATE POLICY "Admins manage providers"
    ON public.service_providers FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create Directory Bookings Table
CREATE TABLE IF NOT EXISTS public.directory_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE NOT NULL,
    
    -- Booking Details
    booking_date DATE NOT NULL,
    booking_time TIME, -- Optional
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    
    -- Fulfillment
    fulfilled_at TIMESTAMPTZ,
    fulfilled_by UUID REFERENCES auth.users(id), -- Provider user_id
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT unique_user_provider_date UNIQUE (user_id, provider_id, booking_date)
);

-- Indexes for directory_bookings
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.directory_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON public.directory_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.directory_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.directory_bookings(status);

-- RLS for directory_bookings
ALTER TABLE public.directory_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own bookings" ON public.directory_bookings;
DROP POLICY IF EXISTS "Providers read own bookings" ON public.directory_bookings;
DROP POLICY IF EXISTS "Users create bookings" ON public.directory_bookings;
DROP POLICY IF EXISTS "Providers update fulfillment" ON public.directory_bookings;

-- Users read their own bookings
CREATE POLICY "Users read own bookings"
    ON public.directory_bookings FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Providers read bookings for their business
CREATE POLICY "Providers read own bookings"
    ON public.directory_bookings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.service_providers sp
            WHERE sp.id = provider_id AND sp.user_id = auth.uid()
        )
    );

-- Users can create bookings
CREATE POLICY "Users create bookings"
    ON public.directory_bookings FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Providers can update fulfillment status
CREATE POLICY "Providers update fulfillment"
    ON public.directory_bookings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.service_providers sp
            WHERE sp.id = provider_id AND sp.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.service_providers sp
            WHERE sp.id = provider_id AND sp.user_id = auth.uid()
        )
    );

-- 5. Create Provider Ratings Table
CREATE TABLE IF NOT EXISTS public.provider_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.directory_bookings(id) ON DELETE CASCADE UNIQUE NOT NULL,
    provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Rating Data
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT one_rating_per_booking UNIQUE (booking_id)
);

-- Indexes for provider_ratings
CREATE INDEX IF NOT EXISTS idx_ratings_provider ON public.provider_ratings(provider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON public.provider_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_booking ON public.provider_ratings(booking_id);

-- RLS for provider_ratings
ALTER TABLE public.provider_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create own ratings" ON public.provider_ratings;
DROP POLICY IF EXISTS "Providers read own ratings" ON public.provider_ratings;
DROP POLICY IF EXISTS "Admins read all ratings" ON public.provider_ratings;

-- Users can create ratings for their completed bookings
CREATE POLICY "Users create own ratings"
    ON public.provider_ratings FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.directory_bookings b
            WHERE b.id = booking_id 
            AND b.user_id = auth.uid()
            AND b.status = 'completed'
        )
    );

-- Providers can read their own ratings
CREATE POLICY "Providers read own ratings"
    ON public.provider_ratings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.service_providers sp
            WHERE sp.id = provider_id AND sp.user_id = auth.uid()
        )
    );

-- Admins can read all ratings
CREATE POLICY "Admins read all ratings"
    ON public.provider_ratings FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- 6. Create Trigger Functions
-- Auto-Flag Re-Approval on Profile Edit
CREATE OR REPLACE FUNCTION public.handle_provider_profile_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If provider edits profile_data and status is 'approved', flag for re-approval
    IF OLD.approval_status = 'approved' 
       AND NEW.profile_data IS DISTINCT FROM OLD.profile_data THEN
        NEW.approval_status := 'needs_reapproval';
        NEW.pending_changes := NEW.profile_data;
        NEW.profile_data := OLD.profile_data; -- Keep old data live
        NEW.last_edit_at := now();
    END IF;
    
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_profile_edit_trigger ON public.service_providers;
CREATE TRIGGER provider_profile_edit_trigger
    BEFORE UPDATE ON public.service_providers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_provider_profile_edit();

-- Auto-Assign Provider Role on Approval
CREATE OR REPLACE FUNCTION public.handle_provider_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- When admin approves, assign service_provider role
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'service_provider')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        NEW.approved_at := now();
        NEW.approved_by := auth.uid();
    END IF;
    
    -- When re-approved, merge pending_changes into profile_data
    IF NEW.approval_status = 'approved' AND OLD.approval_status = 'needs_reapproval' THEN
        NEW.profile_data := NEW.pending_changes;
        NEW.pending_changes := NULL;
        NEW.approved_at := now();
        NEW.approved_by := auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_approval_trigger ON public.service_providers;
CREATE TRIGGER provider_approval_trigger
    BEFORE UPDATE ON public.service_providers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_provider_approval();

-- 7. Create Storage Bucket for Provider Logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'provider-logos',
  'provider-logos',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- RLS Policies for provider-logos bucket
DROP POLICY IF EXISTS "Public read access for provider logos" ON storage.objects;
DROP POLICY IF EXISTS "Providers upload own logos" ON storage.objects;
DROP POLICY IF EXISTS "Providers update own logos" ON storage.objects;
DROP POLICY IF EXISTS "Providers delete own logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage all provider logos" ON storage.objects;

-- Public read access (for directory display)
CREATE POLICY "Public read access for provider logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'provider-logos');

-- Providers can upload to their own folder
CREATE POLICY "Providers upload own logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Providers can update their own logos
CREATE POLICY "Providers update own logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Providers can delete their own logos
CREATE POLICY "Providers delete own logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'provider-logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can manage all logos
CREATE POLICY "Admins manage all provider logos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'provider-logos' AND
  public.has_role(auth.uid(), 'admin')
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the setup:

-- Check if tables exist:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('directory_categories', 'service_providers', 'directory_bookings', 'provider_ratings');

-- Check if enum value exists:
-- SELECT unnest(enum_range(NULL::app_role)) AS role;

-- Check if bucket exists:
-- SELECT * FROM storage.buckets WHERE id = 'provider-logos';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
