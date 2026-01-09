-- Migration: Vehicle Trips View and Daily Mileage Analytics
-- Description: Creates a view to aggregate position history into logical trips and a function to calculate daily mileage

-- =====================================================
-- 1. Create vehicle_trips VIEW
-- =====================================================
-- This view groups position_history records into logical trips based on ignition status changes
-- A trip starts when ignition turns ON and ends when it turns OFF
-- Each trip includes start/end times, start/end coordinates, and calculated distance

CREATE OR REPLACE VIEW vehicle_trips AS
WITH ignition_changes AS (
  -- Detect ignition state changes to identify trip boundaries
  SELECT
    device_id,
    latitude,
    longitude,
    speed,
    battery_percent,
    ignition_on,
    gps_time,
    recorded_at,
    LAG(ignition_on) OVER (PARTITION BY device_id ORDER BY gps_time) AS prev_ignition_state,
    LEAD(ignition_on) OVER (PARTITION BY device_id ORDER BY gps_time) AS next_ignition_state,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY gps_time) AS row_num
  FROM position_history
  WHERE gps_time IS NOT NULL
),
trip_boundaries AS (
  -- Mark trip starts (ignition OFF -> ON) and trip ends (ignition ON -> OFF)
  SELECT
    device_id,
    gps_time,
    latitude,
    longitude,
    ignition_on,
    recorded_at,
    CASE
      WHEN ignition_on = true AND (prev_ignition_state = false OR prev_ignition_state IS NULL) THEN 'trip_start'
      WHEN ignition_on = false AND prev_ignition_state = true THEN 'trip_end'
      ELSE 'ongoing'
    END AS trip_event
  FROM ignition_changes
),
trip_groups AS (
  -- Group consecutive positions into trips using running sum of trip starts
  SELECT
    device_id,
    gps_time,
    latitude,
    longitude,
    ignition_on,
    recorded_at,
    trip_event,
    SUM(CASE WHEN trip_event = 'trip_start' THEN 1 ELSE 0 END)
      OVER (PARTITION BY device_id ORDER BY gps_time) AS trip_number
  FROM trip_boundaries
  WHERE trip_event IN ('trip_start', 'ongoing', 'trip_end')
),
trip_aggregates AS (
  -- Calculate trip metrics (start time, end time, coordinates, distance)
  SELECT
    device_id,
    trip_number,
    MIN(gps_time) FILTER (WHERE trip_event = 'trip_start') AS start_time,
    MAX(gps_time) FILTER (WHERE trip_event = 'trip_end') AS end_time,
    MIN(latitude) FILTER (WHERE trip_event = 'trip_start') AS start_latitude,
    MIN(longitude) FILTER (WHERE trip_event = 'trip_start') AS start_longitude,
    MAX(latitude) FILTER (WHERE trip_event = 'trip_end') AS end_latitude,
    MAX(longitude) FILTER (WHERE trip_event = 'trip_end') AS end_longitude,
    COUNT(*) AS position_count,
    AVG(speed) AS avg_speed,
    MAX(speed) AS max_speed,
    -- Calculate approximate trip distance using Haversine formula between consecutive points
    SUM(
      CASE
        WHEN LAG(latitude) OVER (PARTITION BY device_id, trip_number ORDER BY gps_time) IS NOT NULL
        THEN (
          6371000 * 2 * ASIN(
            SQRT(
              POWER(SIN((latitude - LAG(latitude) OVER (PARTITION BY device_id, trip_number ORDER BY gps_time)) * PI() / 180 / 2), 2) +
              COS(LAG(latitude) OVER (PARTITION BY device_id, trip_number ORDER BY gps_time) * PI() / 180) *
              COS(latitude * PI() / 180) *
              POWER(SIN((longitude - LAG(longitude) OVER (PARTITION BY device_id, trip_number ORDER BY gps_time)) * PI() / 180 / 2), 2)
            )
          )
        )
        ELSE 0
      END
    ) AS distance_meters
  FROM trip_groups
  WHERE trip_number > 0
  GROUP BY device_id, trip_number
  HAVING MIN(gps_time) FILTER (WHERE trip_event = 'trip_start') IS NOT NULL
)
SELECT
  gen_random_uuid() AS id,
  device_id,
  trip_number,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  ROUND(distance_meters::numeric, 2) AS distance_meters,
  ROUND((distance_meters / 1000)::numeric, 2) AS distance_km,
  ROUND(avg_speed::numeric, 1) AS avg_speed_kmh,
  ROUND(max_speed::numeric, 1) AS max_speed_kmh,
  position_count,
  CASE
    WHEN end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
    ELSE NULL
  END AS duration_minutes
FROM trip_aggregates
WHERE start_time IS NOT NULL
ORDER BY device_id, start_time DESC;

-- Grant permissions
GRANT SELECT ON vehicle_trips TO authenticated;
GRANT SELECT ON vehicle_trips TO anon;

-- =====================================================
-- 2. Create get_daily_mileage FUNCTION
-- =====================================================
-- This function calculates total distance covered per day for a specific vehicle
-- Returns daily mileage for the specified number of days (default: 7 days)

CREATE OR REPLACE FUNCTION get_daily_mileage(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  date DATE,
  distance_km NUMERIC,
  trip_count BIGINT,
  total_duration_minutes NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    -- Generate series of dates for the requested period
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS date
  ),
  daily_stats AS (
    -- Aggregate trip data by day
    SELECT
      DATE(start_time) AS trip_date,
      SUM(distance_meters) / 1000 AS total_distance_km,
      COUNT(*) AS trip_count,
      SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS total_duration_minutes
    FROM vehicle_trips
    WHERE device_id = p_device_id
      AND start_time >= CURRENT_DATE - (p_days - 1)
      AND start_time < CURRENT_DATE + 1
      AND end_time IS NOT NULL  -- Only completed trips
    GROUP BY DATE(start_time)
  )
  SELECT
    ds.date,
    COALESCE(ROUND(daily.total_distance_km::numeric, 2), 0) AS distance_km,
    COALESCE(daily.trip_count, 0) AS trip_count,
    COALESCE(ROUND(daily.total_duration_minutes::numeric, 1), 0) AS total_duration_minutes
  FROM date_series ds
  LEFT JOIN daily_stats daily ON ds.date = daily.trip_date
  ORDER BY ds.date DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_daily_mileage(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_mileage(TEXT, INTEGER) TO anon;

-- =====================================================
-- 3. Create helper function for recent trips
-- =====================================================
-- This function retrieves the most recent trips for a vehicle

CREATE OR REPLACE FUNCTION get_recent_trips(
  p_device_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  device_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  start_latitude NUMERIC,
  start_longitude NUMERIC,
  end_latitude NUMERIC,
  end_longitude NUMERIC,
  distance_km NUMERIC,
  avg_speed_kmh NUMERIC,
  max_speed_kmh NUMERIC,
  duration_minutes NUMERIC
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
    vt.start_latitude,
    vt.start_longitude,
    vt.end_latitude,
    vt.end_longitude,
    vt.distance_km,
    vt.avg_speed_kmh,
    vt.max_speed_kmh,
    vt.duration_minutes
  FROM vehicle_trips vt
  WHERE vt.device_id = p_device_id
    AND vt.end_time IS NOT NULL  -- Only completed trips
  ORDER BY vt.start_time DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_trips(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_trips(TEXT, INTEGER) TO anon;

-- =====================================================
-- 4. Create index for better performance
-- =====================================================
-- Index on position_history for faster trip calculations
CREATE INDEX IF NOT EXISTS idx_position_history_ignition
ON position_history(device_id, ignition_on, gps_time);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON VIEW vehicle_trips IS 'Aggregates position history into logical trips based on ignition status changes';
COMMENT ON FUNCTION get_daily_mileage IS 'Calculates daily mileage statistics for a specific vehicle over a given number of days';
COMMENT ON FUNCTION get_recent_trips IS 'Retrieves the most recent completed trips for a specific vehicle';
