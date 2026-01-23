-- Directory Bookings Table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.directory_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON public.directory_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.directory_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.directory_bookings(status);

-- RLS
ALTER TABLE public.directory_bookings ENABLE ROW LEVEL SECURITY;

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
