
-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop table if it exists to start fresh (optional, use with caution)
-- DROP TABLE IF EXISTS public.geofence_zones;

-- Create the geofence_zones table
CREATE TABLE IF NOT EXISTS public.geofence_zones (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    device_id character varying,
    name character varying NOT NULL,
    description text,
    zone_type character varying DEFAULT 'custom'::character varying,
    shape_type character varying DEFAULT 'circle'::character varying,
    center_point geometry(Point, 4326),
    center_latitude double precision,
    center_longitude double precision,
    radius_meters double precision,
    is_active boolean DEFAULT true,
    gps51_id character varying, -- To store the ID from the external GPS51 service
    last_sync_at timestamp with time zone,
    sync_status character varying DEFAULT 'pending'::character varying,
    
    CONSTRAINT geofence_zones_pkey PRIMARY KEY (id),
    CONSTRAINT geofence_zones_name_check CHECK ((char_length(name) > 0))
);

-- Add comments to columns for clarity
COMMENT ON COLUMN public.geofence_zones.gps51_id IS 'To store the ID from the external GPS51 service';
COMMENT ON COLUMN public.geofence_zones.sync_status IS 'pending, synced, failed';

-- Grant usage for the schema and all tables within the schema
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Enable Row Level Security (RLS)
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy: Allow users to see their own geofences or public ones
CREATE POLICY "Allow individual read access"
ON public.geofence_zones
FOR SELECT
USING (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.vehicle_assignments va ON p.id = va.profile_id
    WHERE va.device_id = geofence_zones.device_id
  )
  OR geofence_zones.device_id IS NULL
);

-- Policy: Allow users to create geofences for their own devices
CREATE POLICY "Allow individual create access"
ON public.geofence_zones
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.vehicle_assignments va ON p.id = va.profile_id
    WHERE va.device_id = geofence_zones.device_id
  )
);

-- Policy: Allow users to update their own geofences
CREATE POLICY "Allow individual update access"
ON public.geofence_zones
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.vehicle_assignments va ON p.id = va.profile_id
    WHERE va.device_id = geofence_zones.device_id
  )
);

-- Policy: Allow users to delete their own geofences
CREATE POLICY "Allow individual delete access"
ON public.geofence_zones
FOR DELETE
USING (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.profiles p
    JOIN public.vehicle_assignments va ON p.id = va.profile_id
    WHERE va.device_id = geofence_zones.device_id
  )
);

-- Grant permissions to roles
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.geofence_zones TO authenticated;
GRANT ALL ON TABLE public.geofence_zones TO service_role;
