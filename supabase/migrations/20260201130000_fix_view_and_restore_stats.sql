-- 1. Redefine vehicle_trips with correct column aliases (start_time, end_time) to match previous schema
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

CREATE OR REPLACE VIEW public.vehicle_trips WITH (security_invoker = true) AS
WITH vehicle_telematics_data AS (
  SELECT
    ph.device_id AS vehicle_id,
    ph.gps_time AS device_time,
    ph.ignition_on AS ignition,
    ph.speed,
    COALESCE(vp.total_mileage, 0) AS odometer
  FROM position_history ph
  LEFT JOIN vehicle_positions vp ON ph.device_id = vp.device_id AND ph.gps_time = vp.gps_time
),
ordered_points AS (
  SELECT
    vtd.vehicle_id,
    vtd.device_time,
    vtd.ignition,
    vtd.speed,
    vtd.odometer,
    LAG(vtd.device_time) OVER (
      PARTITION BY vtd.vehicle_id
      ORDER BY vtd.device_time
    ) AS prev_time,
    LAG(vtd.ignition) OVER (
      PARTITION BY vtd.vehicle_id
      ORDER BY vtd.device_time
    ) AS prev_ignition,
    LAG(vtd.odometer) OVER (
      PARTITION BY vtd.vehicle_id
      ORDER BY vtd.device_time
    ) AS prev_odometer
  FROM vehicle_telematics_data vtd
),
trip_boundaries AS (
  SELECT
    *,
    CASE
      -- Trip starts when ignition turns ON
      WHEN ignition = true AND (prev_ignition IS DISTINCT FROM true)
        THEN 1

      -- Trip starts again after 3 minutes of idle
      WHEN ignition = true
       AND prev_time IS NOT NULL
       AND device_time - prev_time > INTERVAL '3 minutes'
        THEN 1

      ELSE 0
    END AS trip_start_flag
  FROM ordered_points
),
trip_groups AS (
  SELECT
    *,
    SUM(trip_start_flag) OVER (
      PARTITION BY vehicle_id
      ORDER BY device_time
      ROWS UNBOUNDED PRECEDING
    ) AS trip_group
  FROM trip_boundaries
),
trip_aggregation AS (
  SELECT
    vehicle_id,
    trip_group,
    MIN(device_time) AS trip_start_time,
    MAX(device_time) AS trip_end_time,
    MAX(odometer) - MIN(odometer) AS distance_km,
    MAX(speed) as max_speed, -- Added to support daily stats
    AVG(speed) as avg_speed  -- Added to support daily stats
  FROM trip_groups
  GROUP BY vehicle_id, trip_group
)
SELECT
  gen_random_uuid() AS id,
  vehicle_id AS device_id,
  trip_start_time AS start_time, -- Fixed alias
  trip_end_time AS end_time,     -- Fixed alias
  GREATEST(distance_km, 0) AS distance_km,
  EXTRACT(EPOCH FROM (trip_end_time - trip_start_time))::INT AS duration_seconds,
  -- Added missing columns needed for daily stats if available, otherwise null/defaults
  NULL::float as start_latitude,
  NULL::float as start_longitude,
  NULL::float as end_latitude,
  NULL::float as end_longitude,
  max_speed,
  avg_speed,
  'gps51_parity'::text AS source,
  now() AS created_at
FROM trip_aggregation
WHERE trip_end_time > trip_start_time;

-- 2. Restore vehicle_daily_stats view
-- This view is critical for daily reports and mileage tracking
CREATE OR REPLACE VIEW public.vehicle_daily_stats WITH (security_invoker = true) AS
SELECT
    device_id,
    date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date as stat_date,
    count(*) as trip_count,
    coalesce(sum(distance_km), 0) as total_distance_km,
    coalesce(avg(distance_km), 0) as avg_distance_km,
    max(max_speed) as peak_speed,
    avg(avg_speed) as avg_speed,
    coalesce(sum(duration_seconds), 0) as total_duration_seconds,
    min(start_time) as first_trip_start,
    max(end_time) as last_trip_end
FROM public.vehicle_trips
GROUP BY device_id, date_trunc('day', start_time AT TIME ZONE 'Africa/Lagos')::date;

-- 3. Grant permissions
GRANT SELECT ON public.vehicle_trips TO authenticated;
GRANT SELECT ON public.vehicle_trips TO service_role;
GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;
