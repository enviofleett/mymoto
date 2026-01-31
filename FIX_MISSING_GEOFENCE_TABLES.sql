-- Consolidated Geofence Migration Script
-- Run this in your Supabase SQL Editor to fix the missing tables error

-- 1. Create Geofence Zones Table
CREATE TYPE geofence_shape AS ENUM ('circle', 'polygon', 'rectangle');
CREATE TYPE geofence_alert_type AS ENUM ('entry', 'exit', 'both');

CREATE TABLE IF NOT EXISTS public.geofence_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  zone_type TEXT,
  color TEXT DEFAULT '#3b82f6',
  shape_type geofence_shape NOT NULL,
  center_point GEOGRAPHY(POINT, 4326),
  radius_meters INTEGER,
  boundary GEOGRAPHY(POLYGON, 4326),
  alert_on geofence_alert_type DEFAULT 'both',
  alert_enabled BOOLEAN DEFAULT true,
  notification_message TEXT,
  device_id TEXT,
  applies_to_all BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  gps51_id TEXT, -- Added from recent migration
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_geofence_center ON geofence_zones USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_geofence_boundary ON geofence_zones USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_geofence_gps51_id ON geofence_zones(gps51_id);

-- 2. Create Geofence Events Table
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

CREATE INDEX IF NOT EXISTS idx_geofence_events_zone ON geofence_events(geofence_id, event_time DESC);

-- 3. Create Vehicle Status Table
CREATE TABLE IF NOT EXISTS public.vehicle_geofence_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  geofence_id UUID REFERENCES geofence_zones(id) ON DELETE CASCADE,
  entered_at TIMESTAMP WITH TIME ZONE,
  entry_latitude DECIMAL(10, 8),
  entry_longitude DECIMAL(11, 8),
  is_inside BOOLEAN DEFAULT false,
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_geofence_status ENABLE ROW LEVEL SECURITY;

-- Policies (simplified for fix)
CREATE POLICY "Users can view geofence zones" ON public.geofence_zones FOR SELECT USING (true);
CREATE POLICY "Users can create geofence zones" ON public.geofence_zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update geofence zones" ON public.geofence_zones FOR UPDATE USING (true);
CREATE POLICY "Users can delete geofence zones" ON public.geofence_zones FOR DELETE USING (true);

CREATE POLICY "Users can view geofence events" ON public.geofence_events FOR SELECT USING (true);
CREATE POLICY "Users can view geofence status" ON public.vehicle_geofence_status FOR SELECT USING (true);

-- Functions (Essential ones)
CREATE OR REPLACE FUNCTION check_geofence_status(
  p_device_id TEXT,
  p_latitude DECIMAL,
  p_longitude DECIMAL
)
RETURNS TABLE (
  inside_geofence BOOLEAN,
  geofence_id UUID,
  geofence_name TEXT,
  zone_type TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    true AS inside_geofence,
    gz.id AS geofence_id,
    gz.name AS geofence_name,
    gz.zone_type
  FROM geofence_zones gz
  WHERE
    gz.is_active = true
    AND (gz.device_id = p_device_id OR gz.applies_to_all = true)
    AND (
      (gz.shape_type = 'circle' AND ST_DWithin(
        gz.center_point,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        gz.radius_meters
      ))
    )
  ORDER BY gz.created_at DESC
  LIMIT 1;
END;
$$;
