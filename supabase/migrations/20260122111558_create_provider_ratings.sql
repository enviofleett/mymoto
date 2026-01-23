-- Provider Ratings Table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ratings_provider ON public.provider_ratings(provider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON public.provider_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_booking ON public.provider_ratings(booking_id);

-- RLS: Private to admin and provider
ALTER TABLE public.provider_ratings ENABLE ROW LEVEL SECURITY;

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
