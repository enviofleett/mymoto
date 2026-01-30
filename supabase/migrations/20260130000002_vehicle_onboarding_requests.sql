-- Create vehicle_onboarding_requests table
CREATE TABLE IF NOT EXISTS public.vehicle_onboarding_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Vehicle Details
    vin TEXT,
    plate_number TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    color TEXT,
    
    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES auth.users(id),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_requests_user ON public.vehicle_onboarding_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_requests_status ON public.vehicle_onboarding_requests(status);

-- Enable RLS
ALTER TABLE public.vehicle_onboarding_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can create requests
CREATE POLICY "Users can create vehicle requests"
    ON public.vehicle_onboarding_requests FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own vehicle requests"
    ON public.vehicle_onboarding_requests FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Admins can manage all requests
CREATE POLICY "Admins manage vehicle requests"
    ON public.vehicle_onboarding_requests FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_requests_updated_at
    BEFORE UPDATE ON public.vehicle_onboarding_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_updated_at();
