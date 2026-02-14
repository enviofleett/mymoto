-- Migration: Backfill vehicle_trips from gps51_trips
-- Purpose: Recover historical trip data when trigger-based sync was missing/broken.
-- Safe to run multiple times.

INSERT INTO public.vehicle_trips (
  id,
  device_id,
  start_time,
  end_time,
  start_latitude,
  start_longitude,
  end_latitude,
  end_longitude,
  distance_km,
  max_speed,
  avg_speed,
  duration_seconds,
  source,
  created_at
)
SELECT
  COALESCE(g.id, gen_random_uuid()),
  g.device_id,
  g.start_time,
  COALESCE(g.end_time, g.start_time),
  COALESCE(g.start_latitude, 0),
  COALESCE(g.start_longitude, 0),
  COALESCE(g.end_latitude, 0),
  COALESCE(g.end_longitude, 0),
  ROUND((COALESCE(g.distance_meters, 0) / 1000.0)::numeric, 2),
  g.max_speed_kmh,
  g.avg_speed_kmh,
  COALESCE(g.duration_seconds, 0),
  'gps51',
  COALESCE(g.created_at, now())
FROM public.gps51_trips g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vehicle_trips vt
  WHERE vt.device_id = g.device_id
    AND vt.start_time = g.start_time
);
