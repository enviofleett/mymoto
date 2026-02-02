CREATE OR REPLACE FUNCTION get_vehicle_trips_optimized(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 200,
  p_start_date TEXT DEFAULT NULL,
  p_end_date TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  distance_km NUMERIC,
  duration_seconds INTEGER,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  max_speed DOUBLE PRECISION,
  avg_speed DOUBLE PRECISION,
  source TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vt.id,
    vt.device_id,
    vt.start_time,
    vt.end_time,
    vt.distance_km,
    vt.duration_seconds,
    vt.start_latitude,
    vt.start_longitude,
    vt.end_latitude,
    vt.end_longitude,
    vt.max_speed::DOUBLE PRECISION,
    vt.avg_speed::DOUBLE PRECISION,
    vt.source
  FROM vehicle_trips vt
  WHERE vt.device_id = p_device_id
  AND vt.source = 'gps51'
  AND (p_start_date IS NULL OR vt.start_time >= p_start_date::timestamp with time zone)
  AND (p_end_date IS NULL OR vt.start_time < p_end_date::timestamp with time zone)
  ORDER BY vt.start_time DESC
  LIMIT p_limit;
END;
$$;
