-- Learned Locations System
-- Automatically identifies and names frequently visited locations

-- Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Learned locations table
CREATE TABLE public.learned_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Location data
  center_point GEOGRAPHY(POINT, 4326) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_meters INTEGER DEFAULT 50, -- Clustering radius

  -- Location identity
  location_name TEXT,
  location_type TEXT, -- 'home', 'work', 'frequent', 'charging', 'parking', 'custom'
  custom_label TEXT,
  address TEXT,

  -- Visit statistics
  visit_count INTEGER DEFAULT 1,
  total_duration_minutes INTEGER DEFAULT 0,
  last_visit_at TIMESTAMP WITH TIME ZONE,
  first_visit_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Visit patterns
  typical_arrival_hour INTEGER, -- 0-23
  typical_duration_minutes INTEGER,
  visits_per_week DECIMAL(5, 2),

  -- Metadata
  auto_detected BOOLEAN DEFAULT true,
  confidence_score DECIMAL(3, 2) DEFAULT 0.5, -- 0-1 confidence in location identity
  tags TEXT[] DEFAULT '{}',
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT valid_location_type CHECK (location_type IN ('home', 'work', 'frequent', 'charging', 'parking', 'custom', 'unknown'))
);

-- Spatial index for fast location queries
CREATE INDEX idx_learned_locations_geography ON learned_locations USING GIST(center_point);
CREATE INDEX idx_learned_locations_device ON learned_locations(device_id, visit_count DESC);
CREATE INDEX idx_learned_locations_type ON learned_locations(device_id, location_type);
CREATE INDEX idx_learned_locations_last_visit ON learned_locations(device_id, last_visit_at DESC);

-- Enable RLS
ALTER TABLE public.learned_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view learned locations"
ON public.learned_locations FOR SELECT
USING (true);

CREATE POLICY "Admins can manage learned locations"
ON public.learned_locations FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to find nearby learned location
CREATE OR REPLACE FUNCTION find_nearby_learned_location(
  p_device_id TEXT,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_meters INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  location_name TEXT,
  location_type TEXT,
  custom_label TEXT,
  distance_meters DECIMAL,
  visit_count INTEGER,
  confidence_score DECIMAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ll.id,
    ll.location_name,
    ll.location_type,
    ll.custom_label,
    ST_Distance(
      ll.center_point,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) AS distance_meters,
    ll.visit_count,
    ll.confidence_score
  FROM learned_locations ll
  WHERE
    ll.device_id = p_device_id
    AND ST_DWithin(
      ll.center_point,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_meters
    )
  ORDER BY distance_meters ASC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION find_nearby_learned_location TO authenticated;

-- Function to cluster and create/update learned locations
CREATE OR REPLACE FUNCTION update_learned_location(
  p_device_id TEXT,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_duration_minutes INTEGER DEFAULT 0,
  p_clustering_radius INTEGER DEFAULT 50
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  nearby_location RECORD;
  new_location_id UUID;
  new_center_point GEOGRAPHY;
  new_latitude DECIMAL;
  new_longitude DECIMAL;
BEGIN
  -- Check if there's a nearby learned location within clustering radius
  SELECT * INTO nearby_location
  FROM learned_locations
  WHERE device_id = p_device_id
    AND ST_DWithin(
      center_point,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_clustering_radius
    )
  ORDER BY ST_Distance(
    center_point,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
  ) ASC
  LIMIT 1;

  IF nearby_location.id IS NOT NULL THEN
    -- Update existing location (weighted average for center point)
    new_center_point := ST_Centroid(
      ST_Collect(
        ARRAY[
          nearby_location.center_point::geometry,
          ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)
        ]
      )
    )::geography;

    new_latitude := ST_Y(new_center_point::geometry);
    new_longitude := ST_X(new_center_point::geometry);

    UPDATE learned_locations
    SET
      center_point = new_center_point,
      latitude = new_latitude,
      longitude = new_longitude,
      visit_count = visit_count + 1,
      total_duration_minutes = total_duration_minutes + p_duration_minutes,
      last_visit_at = now(),
      updated_at = now()
    WHERE id = nearby_location.id;

    RETURN nearby_location.id;
  ELSE
    -- Create new learned location
    INSERT INTO learned_locations (
      device_id,
      center_point,
      latitude,
      longitude,
      radius_meters,
      location_type,
      visit_count,
      total_duration_minutes,
      last_visit_at
    ) VALUES (
      p_device_id,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_latitude,
      p_longitude,
      p_clustering_radius,
      'unknown',
      1,
      p_duration_minutes,
      now()
    )
    RETURNING id INTO new_location_id;

    RETURN new_location_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_learned_location TO service_role;

-- Function to classify location type based on patterns
CREATE OR REPLACE FUNCTION classify_location_type(
  p_location_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  location_rec RECORD;
  classified_type TEXT;
  avg_arrival_hour DECIMAL;
  is_overnight BOOLEAN;
BEGIN
  SELECT * INTO location_rec
  FROM learned_locations
  WHERE id = p_location_id;

  IF location_rec.visit_count < 3 THEN
    RETURN 'frequent';
  END IF;

  -- Analyze visit patterns from position_history
  SELECT
    AVG(EXTRACT(HOUR FROM ph.gps_time)) AS avg_hour,
    COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM ph.gps_time) BETWEEN 22 AND 6) > COUNT(*) * 0.7 AS overnight
  INTO avg_arrival_hour, is_overnight
  FROM position_history ph
  WHERE ph.device_id = location_rec.device_id
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(ph.longitude, ph.latitude), 4326)::geography,
      location_rec.center_point,
      location_rec.radius_meters
    )
    AND ph.gps_time >= now() - INTERVAL '30 days';

  -- Classification logic
  IF is_overnight AND location_rec.visit_count >= 10 THEN
    classified_type := 'home';
  ELSIF avg_arrival_hour BETWEEN 8 AND 18 AND location_rec.visit_count >= 15 THEN
    classified_type := 'work';
  ELSIF location_rec.total_duration_minutes / NULLIF(location_rec.visit_count, 0) < 30 THEN
    classified_type := 'parking';
  ELSE
    classified_type := 'frequent';
  END IF;

  -- Update the location
  UPDATE learned_locations
  SET
    location_type = classified_type,
    typical_arrival_hour = avg_arrival_hour::INTEGER,
    confidence_score = LEAST(location_rec.visit_count::DECIMAL / 20, 1.0),
    updated_at = now()
  WHERE id = p_location_id;

  RETURN classified_type;
END;
$$;

GRANT EXECUTE ON FUNCTION classify_location_type TO service_role;

-- Function to get top learned locations for a device
CREATE OR REPLACE FUNCTION get_learned_locations(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  location_name TEXT,
  location_type TEXT,
  custom_label TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  address TEXT,
  visit_count INTEGER,
  total_duration_minutes INTEGER,
  last_visit_at TIMESTAMP WITH TIME ZONE,
  visits_per_week DECIMAL,
  confidence_score DECIMAL,
  tags TEXT[]
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ll.id,
    ll.location_name,
    ll.location_type,
    ll.custom_label,
    ll.latitude,
    ll.longitude,
    ll.address,
    ll.visit_count,
    ll.total_duration_minutes,
    ll.last_visit_at,
    ll.visits_per_week,
    ll.confidence_score,
    ll.tags
  FROM learned_locations ll
  WHERE ll.device_id = p_device_id
  ORDER BY ll.visit_count DESC, ll.last_visit_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_learned_locations TO authenticated;

-- Function to name learned locations with custom labels
CREATE OR REPLACE FUNCTION name_learned_location(
  p_location_id UUID,
  p_custom_label TEXT,
  p_location_type TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE learned_locations
  SET
    custom_label = p_custom_label,
    location_type = COALESCE(p_location_type, location_type),
    auto_detected = false,
    confidence_score = 1.0,
    updated_at = now()
  WHERE id = p_location_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION name_learned_location TO authenticated;

-- Comments
COMMENT ON TABLE learned_locations IS 'Stores frequently visited locations learned from vehicle movement patterns';
COMMENT ON FUNCTION find_nearby_learned_location IS 'Finds the nearest learned location within a specified radius';
COMMENT ON FUNCTION update_learned_location IS 'Creates or updates a learned location based on visit clustering';
COMMENT ON FUNCTION classify_location_type IS 'Automatically classifies location type (home/work/parking/etc) based on visit patterns';
COMMENT ON FUNCTION get_learned_locations IS 'Returns top learned locations for a vehicle sorted by visit frequency';
COMMENT ON FUNCTION name_learned_location IS 'Allows users to assign custom names to learned locations';
