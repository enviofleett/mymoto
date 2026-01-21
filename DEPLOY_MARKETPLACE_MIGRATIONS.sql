-- ============================================
-- Marketplace Feature - Complete Migration
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- Migration 1: Add Provider Role
-- ============================================
-- Extend app_role enum to include 'provider' role
-- This migration is idempotent and safe to run multiple times

-- Check if PostGIS extension exists (needed for later migrations)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Extend app_role enum safely
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'provider' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'provider';
  END IF;
END $$;

-- Add RLS policy for providers to view their own role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Providers can view own role'
  ) THEN
    CREATE POLICY "Providers can view own role"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() = user_id 
      AND role = 'provider'
    );
  END IF;
END $$;

COMMENT ON TYPE public.app_role IS 'User roles: admin, user, provider';

-- ============================================
-- Migration 2: Marketplace Schema
-- ============================================

-- 1. Service Categories (Admin-managed)
CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT, -- Lucide icon name (e.g., 'wrench', 'car', 'droplet')
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for active categories
CREATE INDEX IF NOT EXISTS idx_service_categories_active 
ON service_categories(is_active, display_order);

-- 2. Service Providers (Linked to profiles)
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT NOT NULL,
  category_id UUID REFERENCES service_categories(id),
  
  -- Profile Details
  description VARCHAR(160),
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Location (PostGIS for geo-searches)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address TEXT,
  location GEOGRAPHY(POINT, 4326), -- PostGIS geography type
  
  -- Status
  is_approved BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Business Hours (JSON for flexibility)
  office_hours JSONB DEFAULT '{}'::jsonb,
  
  -- Ratings (calculated from appointments)
  average_rating DECIMAL(3, 2) DEFAULT 0.00,
  total_ratings INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_latitude CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT valid_longitude CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT valid_rating CHECK (average_rating >= 0 AND average_rating <= 5)
);

-- Spatial index for geo-searches (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_provider_location 
ON service_providers USING GIST(location);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_provider_approved_active 
ON service_providers(is_approved, is_active) 
WHERE is_approved = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_provider_category 
ON service_providers(category_id) 
WHERE is_approved = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_provider_profile 
ON service_providers(profile_id);

-- Function to update location geography from lat/lon
CREATE OR REPLACE FUNCTION update_provider_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.longitude, NEW.latitude), 
      4326
    )::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update location geography
DROP TRIGGER IF EXISTS update_provider_location_trigger ON service_providers;
CREATE TRIGGER update_provider_location_trigger
BEFORE INSERT OR UPDATE OF latitude, longitude ON service_providers
FOR EACH ROW
EXECUTE FUNCTION update_provider_location();

-- 3. Marketplace Services / Products
CREATE TABLE IF NOT EXISTS public.marketplace_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  duration_minutes INTEGER, -- For booking slots
  image_url TEXT,
  
  is_approved BOOLEAN DEFAULT false, -- Admin must approve products too
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_price CHECK (price >= 0),
  CONSTRAINT valid_duration CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_services_provider 
ON marketplace_services(provider_id);

CREATE INDEX IF NOT EXISTS idx_services_approved_active 
ON marketplace_services(is_approved, is_active) 
WHERE is_approved = true AND is_active = true;

-- 4. Appointments / Orders
CREATE TABLE IF NOT EXISTS public.marketplace_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES marketplace_services(id) ON DELETE RESTRICT NOT NULL,
  customer_id UUID REFERENCES profiles(id) ON DELETE RESTRICT NOT NULL,
  provider_id UUID REFERENCES service_providers(id) ON DELETE RESTRICT NOT NULL,
  
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  
  -- Customer notes
  customer_notes TEXT,
  
  -- Ratings (after completion)
  customer_rating INTEGER CHECK (customer_rating IS NULL OR (customer_rating BETWEEN 1 AND 5)),
  provider_rating INTEGER CHECK (provider_rating IS NULL OR (provider_rating BETWEEN 1 AND 5)),
  review_text TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_scheduled_time CHECK (scheduled_at > created_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_customer 
ON marketplace_appointments(customer_id);

CREATE INDEX IF NOT EXISTS idx_appointments_provider 
ON marketplace_appointments(provider_id);

CREATE INDEX IF NOT EXISTS idx_appointments_service 
ON marketplace_appointments(service_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status 
ON marketplace_appointments(status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled 
ON marketplace_appointments(scheduled_at) 
WHERE status IN ('pending', 'confirmed');

-- 5. Ad Campaigns
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE NOT NULL,
  
  title TEXT NOT NULL, -- "50% Off Oil Changes!"
  description TEXT,
  daily_budget DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- Geo-Targeting
  target_radius_km INTEGER DEFAULT 5 CHECK (target_radius_km > 0 AND target_radius_km <= 50),
  
  -- Campaign dates
  start_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  
  -- Statistics
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_budget CHECK (daily_budget > 0),
  CONSTRAINT valid_dates CHECK (end_date IS NULL OR end_date > start_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_provider 
ON ad_campaigns(provider_id);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_active 
ON ad_campaigns(is_active, start_date, end_date) 
WHERE is_active = true;

-- ============================================
-- ROW LEVEL SECURITY (CRITICAL)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Service Categories RLS Policies
DROP POLICY IF EXISTS "Anyone can view active categories" ON service_categories;
CREATE POLICY "Anyone can view active categories"
ON service_categories FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage categories" ON service_categories;
CREATE POLICY "Admins manage categories"
ON service_categories FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Service Providers RLS Policies
DROP POLICY IF EXISTS "Users view approved providers" ON service_providers;
CREATE POLICY "Users view approved providers"
ON service_providers FOR SELECT
USING (is_approved = true AND is_active = true);

DROP POLICY IF EXISTS "Providers manage own data" ON service_providers;
CREATE POLICY "Providers manage own data"
ON service_providers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = service_providers.profile_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = service_providers.profile_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Providers can register" ON service_providers;
CREATE POLICY "Providers can register"
ON service_providers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = service_providers.profile_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Admins manage all providers" ON service_providers;
CREATE POLICY "Admins manage all providers"
ON service_providers FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Marketplace Services RLS Policies
DROP POLICY IF EXISTS "Users view approved services" ON marketplace_services;
CREATE POLICY "Users view approved services"
ON marketplace_services FOR SELECT
USING (is_approved = true AND is_active = true);

DROP POLICY IF EXISTS "Providers manage own services" ON marketplace_services;
CREATE POLICY "Providers manage own services"
ON marketplace_services FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = marketplace_services.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = marketplace_services.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Admins manage all services" ON marketplace_services;
CREATE POLICY "Admins manage all services"
ON marketplace_services FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Appointments RLS Policies
DROP POLICY IF EXISTS "Customers view own appointments" ON marketplace_appointments;
CREATE POLICY "Customers view own appointments"
ON marketplace_appointments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = marketplace_appointments.customer_id
    AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Customers create appointments" ON marketplace_appointments;
CREATE POLICY "Customers create appointments"
ON marketplace_appointments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = marketplace_appointments.customer_id
    AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Providers view own appointments" ON marketplace_appointments;
CREATE POLICY "Providers view own appointments"
ON marketplace_appointments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = marketplace_appointments.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Providers update own appointments" ON marketplace_appointments;
CREATE POLICY "Providers update own appointments"
ON marketplace_appointments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = marketplace_appointments.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Admins manage all appointments" ON marketplace_appointments;
CREATE POLICY "Admins manage all appointments"
ON marketplace_appointments FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Ad Campaigns RLS Policies
DROP POLICY IF EXISTS "Providers manage own campaigns" ON ad_campaigns;
CREATE POLICY "Providers manage own campaigns"
ON ad_campaigns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = ad_campaigns.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM service_providers sp
    JOIN profiles p ON p.id = sp.profile_id
    WHERE sp.id = ad_campaigns.provider_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Admins manage all campaigns" ON ad_campaigns;
CREATE POLICY "Admins manage all campaigns"
ON ad_campaigns FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- ============================================
-- Helper Functions
-- ============================================

-- Function to update provider average rating
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.customer_rating IS NOT NULL THEN
    UPDATE service_providers
    SET 
      total_ratings = (
        SELECT COUNT(*) 
        FROM marketplace_appointments 
        WHERE provider_id = NEW.provider_id 
        AND customer_rating IS NOT NULL
      ),
      average_rating = (
        SELECT COALESCE(AVG(customer_rating), 0)
        FROM marketplace_appointments 
        WHERE provider_id = NEW.provider_id 
        AND customer_rating IS NOT NULL
      )
    WHERE id = NEW.provider_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update provider rating on appointment completion
DROP TRIGGER IF EXISTS update_provider_rating_trigger ON marketplace_appointments;
CREATE TRIGGER update_provider_rating_trigger
AFTER UPDATE OF status, customer_rating ON marketplace_appointments
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.customer_rating IS NOT NULL)
EXECUTE FUNCTION update_provider_rating();

-- Function to search providers by location (for edge function)
CREATE OR REPLACE FUNCTION search_providers_nearby(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_km INTEGER DEFAULT 3,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  business_name TEXT,
  description VARCHAR(160),
  logo_url TEXT,
  contact_phone TEXT,
  address TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_km DECIMAL,
  average_rating DECIMAL,
  total_ratings INTEGER,
  category_id UUID,
  category_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    sp.business_name,
    sp.description,
    sp.logo_url,
    sp.contact_phone,
    sp.address,
    sp.latitude,
    sp.longitude,
    ST_Distance(
      sp.location,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) / 1000.0 AS distance_km,
    sp.average_rating,
    sp.total_ratings,
    sp.category_id,
    sc.name AS category_name
  FROM service_providers sp
  LEFT JOIN service_categories sc ON sc.id = sp.category_id
  WHERE 
    sp.is_approved = true 
    AND sp.is_active = true
    AND sp.location IS NOT NULL
    AND ST_DWithin(
      sp.location,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_km * 1000 -- Convert km to meters
    )
    AND (p_category_id IS NULL OR sp.category_id = p_category_id)
  ORDER BY distance_km ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION search_providers_nearby TO authenticated, anon;

-- Function to calculate distance between two points (for match-ads)
CREATE OR REPLACE FUNCTION distance_between_points(
  lat1 DECIMAL,
  lon1 DECIMAL,
  lat2 DECIMAL,
  lon2 DECIMAL
)
RETURNS DECIMAL
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ST_Distance(
    ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
  ) / 1000.0; -- Return distance in km
$$;

GRANT EXECUTE ON FUNCTION distance_between_points TO authenticated, service_role;

COMMENT ON TABLE service_categories IS 'Admin-managed service categories (Car Wash, Mechanic, etc.)';
COMMENT ON TABLE service_providers IS 'Service provider profiles linked to user profiles';
COMMENT ON TABLE marketplace_services IS 'Services/products offered by providers';
COMMENT ON TABLE marketplace_appointments IS 'Customer appointments/bookings with providers';
COMMENT ON TABLE ad_campaigns IS 'Location-based advertising campaigns for providers';

-- ============================================
-- Migration 3: Ad Message Log
-- ============================================

CREATE TABLE IF NOT EXISTS public.ad_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  message_content TEXT,
  
  -- Prevent duplicate sends per day
  CONSTRAINT unique_campaign_device_date UNIQUE(campaign_id, device_id, DATE(sent_at))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ad_log_device_date 
ON ad_message_log(device_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_log_campaign 
ON ad_message_log(campaign_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_log_recent 
ON ad_message_log(sent_at DESC) 
WHERE sent_at > NOW() - INTERVAL '24 hours';

-- Enable RLS
ALTER TABLE public.ad_message_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Service role manages ad logs" ON ad_message_log;
CREATE POLICY "Service role manages ad logs"
ON ad_message_log FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Providers view own campaign logs" ON ad_message_log;
CREATE POLICY "Providers view own campaign logs"
ON ad_message_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ad_campaigns ac
    JOIN service_providers sp ON sp.id = ac.provider_id
    JOIN profiles p ON p.id = sp.profile_id
    WHERE ac.id = ad_message_log.campaign_id
    AND p.user_id = auth.uid()
    AND has_role(auth.uid(), 'provider')
  )
);

DROP POLICY IF EXISTS "Admins view all ad logs" ON ad_message_log;
CREATE POLICY "Admins view all ad logs"
ON ad_message_log FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Function to check if ad was recently sent (for throttling)
CREATE OR REPLACE FUNCTION was_ad_recently_sent(
  p_campaign_id UUID,
  p_device_id TEXT,
  p_hours_threshold INTEGER DEFAULT 24
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ad_message_log
    WHERE campaign_id = p_campaign_id
    AND device_id = p_device_id
    AND sent_at > NOW() - (p_hours_threshold || ' hours')::INTERVAL
  );
$$;

GRANT EXECUTE ON FUNCTION was_ad_recently_sent TO authenticated, service_role;

COMMENT ON TABLE ad_message_log IS 'Tracks sent ad messages to prevent duplicate sends and spam';
COMMENT ON FUNCTION was_ad_recently_sent IS 'Checks if an ad was sent to a device within the threshold hours';

-- ============================================
-- Insert Default Categories (Optional)
-- ============================================
INSERT INTO service_categories (name, icon, description, display_order) VALUES
  ('Car Wash', 'droplet', 'Vehicle cleaning and detailing services', 1),
  ('Mechanic', 'wrench', 'Auto repair and maintenance', 2),
  ('Tire Service', 'circle', 'Tire replacement and repair', 3),
  ('Oil Change', 'droplet', 'Oil and fluid services', 4),
  ('Battery Service', 'battery', 'Battery replacement and testing', 5),
  ('Other', 'more-horizontal', 'Other automotive services', 99)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Migration Complete!
-- ============================================
-- Next steps:
-- 1. Deploy edge functions: marketplace-search, match-ads, booking-handler
-- 2. Update billing-cron function (already updated in code)
-- 3. Test the marketplace functionality
