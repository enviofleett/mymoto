-- Intelligent Geofencing System
-- Define zones and track vehicle entry/exit events

-- Geofence shape types
CREATE TYPE geofence_shape AS ENUM (
  'circle',
  'polygon',
  'rectangle'
);

-- Geofence alert types
CREATE TYPE geofence_alert_type AS ENUM (
  'entry',
  'exit',
  'both'
);

-- Geofence zones table
CREATE TABLE public.geofence_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Zone identification
  name TEXT NOT NULL,
  description TEXT,
  zone_type TEXT, -- 'home', 'work', 'restricted', 'safe', 'custom'
  color TEXT DEFAULT '#3b82f6', -- Hex color for UI display

  -- Geometry (PostGIS)
  shape_type geofence_shape NOT NULL,
  center_point GEOGRAPHY(POINT, 4326),
  radius_meters INTEGER, -- For circles
  boundary GEOGRAPHY(POLYGON, 4326), -- For polygons/rectangles

  -- Alert configuration
  alert_on geofence_alert_type DEFAULT 'both',
  alert_enabled BOOLEAN DEFAULT true,
  notification_message TEXT,

  -- Device assignment
  device_id TEXT, -- NULL means applies to all vehicles
  applies_to_all BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT valid_shape CHECK (
    (shape_type = 'circle' AND center_point IS NOT NULL AND radius_meters IS NOT NULL)
    OR (shape_type IN ('polygon', 'rectangle') AND boundary IS NOT NULL)
  )
);

-- Spatial indexes
CREATE INDEX idx_geofence_center ON geofence_zones USING GIST(center_point);
CREATE INDEX idx_geofence_boundary ON geofence_zones USING GIST(boundary);
CREATE INDEX idx_geofence_device ON geofence_zones(device_id, is_active);
CREATE INDEX idx_geofence_active ON geofence_zones(is_active, applies_to_all);

-- Geofence events table (entry/exit history)
CREATE TABLE public.geofence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID NOT NULL REFERENCES geofence_zones(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,

  -- Event details
  event_type TEXT NOT NULL, -- 'entry' or 'exit'
  event_time TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Location at event
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  speed DECIMAL,

  -- Metadata
  duration_inside_minutes INTEGER, -- For exit events
  notification_sent BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_geofence_events_zone ON geofence_events(geofence_id, event_time DESC);
CREATE INDEX idx_geofence_events_device ON geofence_events(device_id, event_time DESC);
CREATE INDEX idx_geofence_events_type ON geofence_events(event_type, event_time DESC);

-- Enable RLS
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view geofence zones"
ON public.geofence_zones FOR SELECT
USING (true);

CREATE POLICY "Users can create geofence zones"
ON public.geofence_zones FOR INSERT
WITH CHECK (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their geofence zones"
ON public.geofence_zones FOR UPDATE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete their geofence zones"
ON public.geofence_zones FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view geofence events"
ON public.geofence_events FOR SELECT
USING (true);

-- Function to create a circular geofence
CREATE OR REPLACE FUNCTION create_circular_geofence(
  p_name TEXT,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_meters INTEGER,
  p_description TEXT DEFAULT NULL,
  p_zone_type TEXT DEFAULT 'custom',
  p_device_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  geofence_id UUID;
BEGIN
  INSERT INTO geofence_zones (
    name,
    description,
    zone_type,
    shape_type,
    center_point,
    radius_meters,
    device_id,
    applies_to_all,
    created_by
  ) VALUES (
    p_name,
    p_description,
    p_zone_type,
    'circle'::geofence_shape,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_radius_meters,
    p_device_id,
    p_device_id IS NULL,
    p_user_id
  )
  RETURNING id INTO geofence_id;

  RETURN geofence_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_circular_geofence TO authenticated;

-- Function to check if a point is inside any geofence
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
      -- Check circle geofences
      (gz.shape_type = 'circle' AND ST_DWithin(
        gz.center_point,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        gz.radius_meters
      ))
      OR
      -- Check polygon/rectangle geofences
      (gz.shape_type IN ('polygon', 'rectangle') AND ST_Contains(
        gz.boundary::geometry,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)
      ))
    )
  ORDER BY gz.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION check_geofence_status TO authenticated;

-- Function to get all geofences for a device
CREATE OR REPLACE FUNCTION get_geofences(
  p_device_id TEXT DEFAULT NULL,
  p_include_inactive BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  zone_type TEXT,
  shape_type geofence_shape,
  center_latitude DECIMAL,
  center_longitude DECIMAL,
  radius_meters INTEGER,
  alert_on geofence_alert_type,
  alert_enabled BOOLEAN,
  is_active BOOLEAN,
  device_id TEXT,
  applies_to_all BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gz.id,
    gz.name,
    gz.description,
    gz.zone_type,
    gz.shape_type,
    ST_Y(gz.center_point::geometry) AS center_latitude,
    ST_X(gz.center_point::geometry) AS center_longitude,
    gz.radius_meters,
    gz.alert_on,
    gz.alert_enabled,
    gz.is_active,
    gz.device_id,
    gz.applies_to_all,
    gz.created_at
  FROM geofence_zones gz
  WHERE
    (p_device_id IS NULL OR gz.device_id = p_device_id OR gz.applies_to_all = true)
    AND (p_include_inactive = true OR gz.is_active = true)
  ORDER BY gz.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_geofences TO authenticated;

-- Function to get recent geofence events
CREATE OR REPLACE FUNCTION get_geofence_events(
  p_device_id TEXT DEFAULT NULL,
  p_geofence_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  geofence_id UUID,
  geofence_name TEXT,
  device_id TEXT,
  event_type TEXT,
  event_time TIMESTAMP WITH TIME ZONE,
  latitude DECIMAL,
  longitude DECIMAL,
  speed DECIMAL,
  duration_inside_minutes INTEGER,
  age_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.id,
    ge.geofence_id,
    gz.name AS geofence_name,
    ge.device_id,
    ge.event_type,
    ge.event_time,
    ge.latitude,
    ge.longitude,
    ge.speed,
    ge.duration_inside_minutes,
    EXTRACT(EPOCH FROM (now() - ge.event_time))::INTEGER / 60 AS age_minutes
  FROM geofence_events ge
  INNER JOIN geofence_zones gz ON ge.geofence_id = gz.id
  WHERE
    (p_device_id IS NULL OR ge.device_id = p_device_id)
    AND (p_geofence_id IS NULL OR ge.geofence_id = p_geofence_id)
  ORDER BY ge.event_time DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_geofence_events TO authenticated;

-- Function to update geofence
CREATE OR REPLACE FUNCTION update_geofence(
  p_geofence_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_alert_on geofence_alert_type DEFAULT NULL,
  p_alert_enabled BOOLEAN DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE geofence_zones
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    alert_on = COALESCE(p_alert_on, alert_on),
    alert_enabled = COALESCE(p_alert_enabled, alert_enabled),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_geofence_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION update_geofence TO authenticated;

-- Function to delete geofence
CREATE OR REPLACE FUNCTION delete_geofence(
  p_geofence_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM geofence_zones
  WHERE id = p_geofence_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_geofence TO authenticated;

-- Comments
COMMENT ON TABLE geofence_zones IS 'Defines virtual geographic boundaries for vehicle monitoring';
COMMENT ON TABLE geofence_events IS 'Records vehicle entry and exit events for geofence zones';
COMMENT ON FUNCTION create_circular_geofence IS 'Creates a circular geofence zone';
COMMENT ON FUNCTION check_geofence_status IS 'Checks if a vehicle location is inside any active geofence';
COMMENT ON FUNCTION get_geofences IS 'Retrieves geofence zones for a device or all devices';
COMMENT ON FUNCTION get_geofence_events IS 'Retrieves historical geofence entry/exit events';
