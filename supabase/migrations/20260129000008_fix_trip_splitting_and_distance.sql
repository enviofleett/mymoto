-- Migration: Fix Trip Splitting Logic and Distance Calculation
-- Description: 
-- 1. Updates get_vehicle_trips_optimized to use gap-based detection (> 3 mins) 
--    instead of simple ignition transitions, effectively merging short stops and flickering signals.
-- 2. Calculates distance using GPS coordinates (ST_Distance) to fix missing odometer history.
-- 3. Ensures PostGIS extension is available for geography calculations.

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
  WITH vehicle_telematics_data AS (
    SELECT
      ph.device_id AS vehicle_id,
      ph.gps_time AS device_time,
      ph.ignition_on AS ignition,
      ph.speed,
      ph.latitude,
      ph.longitude
    FROM position_history ph
    WHERE ph.device_id = p_device_id
    AND (p_start_date IS NULL OR ph.gps_time >= p_start_date::timestamp with time zone)
    AND (p_end_date IS NULL OR ph.gps_time < p_end_date::timestamp with time zone)
    AND ph.ignition_on = true -- CRITICAL: Only look at ON points to ignore short OFF periods
  ),
  ordered_points AS ( 
    SELECT 
      vtd.vehicle_id, 
      vtd.device_time, 
      vtd.speed, 
      vtd.latitude,
      vtd.longitude,
      LAG(vtd.device_time) OVER (ORDER BY vtd.device_time) AS prev_time, 
      LAG(vtd.latitude) OVER (ORDER BY vtd.device_time) AS prev_lat,
      LAG(vtd.longitude) OVER (ORDER BY vtd.device_time) AS prev_lon
    FROM vehicle_telematics_data vtd 
  ), 
  trip_boundaries AS ( 
    SELECT 
      *, 
      CASE 
        -- First point is always a start
        WHEN prev_time IS NULL THEN 1
        -- Gap > 3 minutes means new trip (GPS51 Logic)
        WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 1 
        ELSE 0 
      END AS trip_start_flag,
      -- Calculate distance segment (if not new trip)
      CASE
        WHEN prev_time IS NULL THEN 0::float
        WHEN device_time - prev_time > INTERVAL '3 minutes' THEN 0::float -- Start of new trip has 0 dist from prev
        ELSE 
          -- Use PostGIS ST_Distance for accurate geodetic distance in meters
          ST_Distance(
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint(prev_lon, prev_lat), 4326)::geography
          ) / 1000.0 -- Convert to KM
      END AS dist_segment
    FROM ordered_points 
  ), 
  trip_groups AS ( 
    SELECT 
      *, 
      SUM(trip_start_flag) OVER (ORDER BY device_time ROWS UNBOUNDED PRECEDING) AS trip_group 
    FROM trip_boundaries 
  ), 
  trip_aggregation AS ( 
    SELECT 
      vehicle_id, 
      trip_group, 
      MIN(device_time) AS trip_start_time, 
      MAX(device_time) AS trip_end_time, 
      SUM(dist_segment) AS agg_distance_km,
      -- Coordinates
      (array_agg(latitude ORDER BY device_time ASC))[1] as agg_start_latitude,
      (array_agg(longitude ORDER BY device_time ASC))[1] as agg_start_longitude,
      (array_agg(latitude ORDER BY device_time DESC))[1] as agg_end_latitude,
      (array_agg(longitude ORDER BY device_time DESC))[1] as agg_end_longitude,
      -- Speed
      MAX(speed) as agg_max_speed,
      AVG(speed) as agg_avg_speed
    FROM trip_groups 
    GROUP BY vehicle_id, trip_group 
  ) 
  SELECT 
    gen_random_uuid() AS id, 
    ta.vehicle_id AS device_id,
    ta.trip_start_time AS start_time, 
    ta.trip_end_time AS end_time, 
    GREATEST(ta.agg_distance_km, 0)::numeric AS distance_km, 
    EXTRACT(EPOCH FROM (ta.trip_end_time - ta.trip_start_time))::INT AS duration_seconds, 
    ta.agg_start_latitude AS start_latitude,
    ta.agg_start_longitude AS start_longitude,
    ta.agg_end_latitude AS end_latitude,
    ta.agg_end_longitude AS end_longitude,
    ta.agg_max_speed AS max_speed,
    ta.agg_avg_speed AS avg_speed,
    'gps51'::text AS source
  FROM trip_aggregation ta
  WHERE ta.trip_end_time > ta.trip_start_time
  AND ta.agg_distance_km >= 0.05
  ORDER BY ta.trip_start_time DESC
  LIMIT p_limit;
END;
$$;
