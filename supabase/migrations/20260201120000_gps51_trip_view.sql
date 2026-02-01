-- 1. Drop existing objects (Prioritize Table drop since we know it exists as a table)
DROP TABLE IF EXISTS public.vehicle_trips CASCADE;
DROP VIEW IF EXISTS public.vehicle_trips CASCADE;

-- 2. Recreate vehicle_trips as a VIEW
CREATE VIEW public.vehicle_trips WITH (security_invoker = true) AS
WITH vehicle_telematics_data AS (
  -- Adapter to map existing tables to expected structure
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
    MAX(odometer) - MIN(odometer) AS distance_km
  FROM trip_groups
  GROUP BY vehicle_id, trip_group
)
SELECT
  gen_random_uuid() AS id,
  vehicle_id AS device_id,
  trip_start_time,
  trip_end_time,
  GREATEST(distance_km, 0) AS distance_km,
  EXTRACT(EPOCH FROM (trip_end_time - trip_start_time))::INT AS duration_seconds,
  'gps51_parity'::text AS source,
  now() AS created_at
FROM trip_aggregation
WHERE trip_end_time > trip_start_time;

-- 3. Grant Permissions
GRANT SELECT ON public.vehicle_trips TO authenticated;
GRANT SELECT ON public.vehicle_trips TO service_role;
