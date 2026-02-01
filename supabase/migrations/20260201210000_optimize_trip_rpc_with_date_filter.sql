-- Migration: Optimize get_vehicle_trips_optimized to use raw position_history with date filtering
-- Description: 
-- Redefines get_vehicle_trips_optimized to query position_history directly instead of the slow vehicle_trips view.
-- This allows pushing down date filters to the raw data scan, preventing timeouts on large datasets.
-- Implements GPS51 parity logic: Ignition-based trips, 3-minute idle timeout, and ST_Distance calculation.

DROP FUNCTION IF EXISTS get_vehicle_trips_optimized(TEXT, INTEGER, TEXT, TEXT);

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
  WITH raw_data AS (
    SELECT
      ph.device_id,
      ph.gps_time,
      ph.latitude,
      ph.longitude,
      ph.speed,
      ph.ignition_on
    FROM position_history ph
    WHERE ph.device_id = p_device_id
    -- Push down date filter with 1 hour buffer to capture trip boundaries
    AND (p_start_date IS NULL OR ph.gps_time >= (p_start_date::timestamptz - INTERVAL '1 hour'))
    AND (p_end_date IS NULL OR ph.gps_time <= (p_end_date::timestamptz + INTERVAL '1 hour'))
    ORDER BY ph.gps_time ASC
  ),
  with_lag AS (
    SELECT
      rd.device_id,
      rd.gps_time,
      rd.latitude,
      rd.longitude,
      rd.speed,
      rd.ignition_on,
      LAG(rd.gps_time) OVER (ORDER BY rd.gps_time) as prev_time,
      LAG(rd.ignition_on) OVER (ORDER BY rd.gps_time) as prev_ignition,
      LAG(rd.latitude) OVER (ORDER BY rd.gps_time) as prev_lat,
      LAG(rd.longitude) OVER (ORDER BY rd.gps_time) as prev_lon
    FROM raw_data rd
  ),
  with_boundaries AS (
    SELECT
      wl.*,
      CASE
        -- Trip starts when ignition turns ON (from OFF or NULL)
        WHEN wl.ignition_on = true AND (wl.prev_ignition IS NULL OR wl.prev_ignition = false) THEN 1
        -- Trip starts again after 3 minutes of idle (gap in data or logic)
        -- Note: We check time gap between points where ignition is ON
        WHEN wl.ignition_on = true AND (wl.gps_time - wl.prev_time > INTERVAL '3 minutes') THEN 1
        ELSE 0
      END as is_start
    FROM with_lag wl
    WHERE wl.ignition_on = true -- Only consider points where ignition is ON for trip body
  ),
  with_groups AS (
    SELECT
      wb.*,
      SUM(wb.is_start) OVER (ORDER BY wb.gps_time) as trip_group
    FROM with_boundaries wb
  )
  SELECT
    gen_random_uuid() as id,
    p_device_id as device_id,
    MIN(wg.gps_time) as start_time,
    MAX(wg.gps_time) as end_time,
    -- Calculate distance using PostGIS for accuracy
    COALESCE(
      SUM(
        ST_Distance(
          ST_SetSRID(ST_MakePoint(wg.longitude, wg.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(wg.prev_lon, wg.prev_lat), 4326)::geography
        )
      ) / 1000.0, 
      0
    )::numeric(10,2) as distance_km,
    EXTRACT(EPOCH FROM (MAX(wg.gps_time) - MIN(wg.gps_time)))::integer as duration_seconds,
    (ARRAY_AGG(wg.latitude ORDER BY wg.gps_time ASC))[1] as start_latitude,
    (ARRAY_AGG(wg.longitude ORDER BY wg.gps_time ASC))[1] as start_longitude,
    (ARRAY_AGG(wg.latitude ORDER BY wg.gps_time DESC))[1] as end_latitude,
    (ARRAY_AGG(wg.longitude ORDER BY wg.gps_time DESC))[1] as end_longitude,
    MAX(wg.speed)::numeric(6,1) as max_speed,
    AVG(wg.speed)::numeric(6,1) as avg_speed,
    'gps51' as source
  FROM with_groups wg
  GROUP BY trip_group
  HAVING
    -- Apply strict date filter to the final trip
    (p_start_date IS NULL OR MIN(wg.gps_time) >= p_start_date::timestamptz)
    AND (p_end_date IS NULL OR MIN(wg.gps_time) < p_end_date::timestamptz)
    -- Filter noise: < 50m distance OR < 5 min duration
    AND (
      COALESCE(
        SUM(
          ST_Distance(
            ST_SetSRID(ST_MakePoint(wg.longitude, wg.latitude), 4326)::geography,
            ST_SetSRID(ST_MakePoint(wg.prev_lon, wg.prev_lat), 4326)::geography
          )
        ) / 1000.0, 
        0
      ) >= 0.05 -- 50 meters
      OR EXTRACT(EPOCH FROM (MAX(wg.gps_time) - MIN(wg.gps_time))) >= 300 -- 5 minutes
    )
  ORDER BY start_time DESC
  LIMIT p_limit;
END;
$$;
