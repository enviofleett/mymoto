-- =============================================
-- GEOFENCING SYSTEM: Tables for location-based alerts
-- =============================================

-- Named locations that can be reused across monitors
CREATE TABLE public.geofence_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g., "Garki", "Home", "Office"
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 500, -- Default 500m radius
    created_by UUID REFERENCES auth.users(id),
    is_system BOOLEAN DEFAULT false, -- System locations vs user-created
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active geofence monitors (what the AI creates when user says "notify me when...")
CREATE TABLE public.geofence_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL, -- Which vehicle to monitor
    location_id UUID REFERENCES public.geofence_locations(id) ON DELETE CASCADE,
    -- Or inline location (for one-off monitors)
    location_name TEXT, -- Used when location_id is null
    latitude DOUBLE PRECISION, -- Used when location_id is null
    longitude DOUBLE PRECISION, -- Used when location_id is null
    radius_meters INTEGER DEFAULT 500, -- Used when location_id is null
    
    -- Monitor configuration
    trigger_on TEXT NOT NULL CHECK (trigger_on IN ('enter', 'exit', 'both')),
    is_active BOOLEAN DEFAULT true,
    one_time BOOLEAN DEFAULT false, -- Auto-deactivate after first trigger
    
    -- Time-based conditions
    active_from TIME, -- e.g., 08:00 (only monitor during this window)
    active_until TIME, -- e.g., 18:00
    active_days INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6], -- 0=Sunday, 6=Saturday
    expires_at TIMESTAMPTZ, -- Auto-expire monitor
    
    -- Tracking state
    vehicle_inside BOOLEAN DEFAULT false, -- Current state: is vehicle inside?
    last_checked_at TIMESTAMPTZ,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    
    -- Ownership
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT valid_location CHECK (
        (location_id IS NOT NULL) OR 
        (latitude IS NOT NULL AND longitude IS NOT NULL AND location_name IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.geofence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geofence_id UUID NOT NULL REFERENCES geofence_zones(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    speed DECIMAL,
    duration_inside_minutes INTEGER,
    notification_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.geofence_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for geofence_locations
CREATE POLICY "Authenticated users can read locations" 
    ON public.geofence_locations FOR SELECT 
    USING (true);

CREATE POLICY "Users can manage their own locations" 
    ON public.geofence_locations FOR ALL 
    USING (auth.uid() = created_by OR is_system = true)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can manage all locations" 
    ON public.geofence_locations FOR ALL 
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage locations" 
    ON public.geofence_locations FOR ALL 
    USING (true)
    WITH CHECK (true);

-- RLS Policies for geofence_monitors
CREATE POLICY "Authenticated users can read monitors" 
    ON public.geofence_monitors FOR SELECT 
    USING (true);

CREATE POLICY "Users can manage their own monitors" 
    ON public.geofence_monitors FOR ALL 
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can manage all monitors" 
    ON public.geofence_monitors FOR ALL 
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage monitors" 
    ON public.geofence_monitors FOR ALL 
    USING (true)
    WITH CHECK (true);

-- RLS Policies for geofence_events
CREATE POLICY "Authenticated users can read events" 
    ON public.geofence_events FOR SELECT 
    USING (true);

CREATE POLICY "Service role can manage events" 
    ON public.geofence_events FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_geofence_monitors_device ON public.geofence_monitors(device_id);
CREATE INDEX IF NOT EXISTS idx_geofence_monitors_active ON public.geofence_monitors(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_geofence_events_device ON public.geofence_events(device_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_triggered ON public.geofence_events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_locations_name ON public.geofence_locations USING gin(to_tsvector('english', name));

-- Function to check if a point is inside a geofence (Haversine)
CREATE OR REPLACE FUNCTION public.is_inside_geofence(
    p_lat DOUBLE PRECISION,
    p_lon DOUBLE PRECISION,
    g_lat DOUBLE PRECISION,
    g_lon DOUBLE PRECISION,
    g_radius_meters INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    R CONSTANT INTEGER := 6371000; -- Earth radius in meters
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
    distance DOUBLE PRECISION;
BEGIN
    dlat := radians(g_lat - p_lat);
    dlon := radians(g_lon - p_lon);
    a := sin(dlat/2) * sin(dlat/2) + 
         cos(radians(p_lat)) * cos(radians(g_lat)) * 
         sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    distance := R * c;
    
    RETURN distance <= g_radius_meters;
END;
$$;

-- Function to geocode location name to coordinates using Mapbox (called from edge function)
-- This is a placeholder - actual geocoding happens in edge function
CREATE OR REPLACE FUNCTION public.find_or_create_location(
    p_name TEXT,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL,
    p_radius INTEGER DEFAULT 500,
    p_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_location_id UUID;
BEGIN
    -- First try to find existing location with similar name
    SELECT id INTO v_location_id
    FROM geofence_locations
    WHERE LOWER(name) = LOWER(p_name)
    LIMIT 1;
    
    IF v_location_id IS NOT NULL THEN
        RETURN v_location_id;
    END IF;
    
    -- If coordinates provided, create new location
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        INSERT INTO geofence_locations (name, latitude, longitude, radius_meters, created_by)
        VALUES (p_name, p_latitude, p_longitude, p_radius, p_user_id)
        RETURNING id INTO v_location_id;
        
        RETURN v_location_id;
    END IF;
    
    -- No coordinates and not found - return NULL (edge function will geocode)
    RETURN NULL;
END;
$$;

-- Add some common Nigerian locations as system locations
INSERT INTO geofence_locations (name, latitude, longitude, radius_meters, is_system) VALUES
    ('Garki', 9.0579, 7.4951, 2000, true),
    ('Wuse', 9.0764, 7.4896, 2000, true),
    ('Maitama', 9.0928, 7.5000, 2000, true),
    ('Central Business District', 9.0574, 7.4952, 1500, true),
    ('Asokoro', 9.0413, 7.5133, 2000, true),
    ('Gwarinpa', 9.1167, 7.3833, 3000, true),
    ('Jabi', 9.0744, 7.4269, 2000, true),
    ('Utako', 9.0822, 7.4331, 1500, true),
    ('Lagos Island', 6.4541, 3.4080, 3000, true),
    ('Victoria Island', 6.4281, 3.4219, 3000, true),
    ('Ikeja', 6.6018, 3.3515, 3000, true),
    ('Lekki', 6.4698, 3.5852, 5000, true)
ON CONFLICT DO NOTHING;
