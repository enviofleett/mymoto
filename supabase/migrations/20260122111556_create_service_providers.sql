-- Service Providers Table
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
    -- Structure: {
    --   "logo_url": "...",
    --   "description": "200 char pitch",
    --   "location": { "lat": 0, "lng": 0, "address": "...", "mapbox_place_id": "..." },
    --   "perks": ["10% off for Fleet Users", ...]
    -- }
    
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_providers_user ON public.service_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_category ON public.service_providers(category_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_status ON public.service_providers(approval_status);
CREATE INDEX IF NOT EXISTS idx_service_providers_approved ON public.service_providers(approval_status, approved_at) 
    WHERE approval_status = 'approved';

-- RLS Policies
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

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
