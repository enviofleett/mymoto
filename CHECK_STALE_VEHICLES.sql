-- Staleness monitoring (Phase 1)
-- Run in Supabase SQL Editor
--
-- Primary goal: identify vehicles whose live data is stale (gps_time / last_synced_at)

-- 1) Fleet-wide staleness view (top 50 stalest)
SELECT
  vp.device_id,
  vp.gps_time,
  vp.last_synced_at,
  (now() - vp.gps_time) AS gps_age,
  (now() - vp.last_synced_at) AS sync_age,
  vp.is_online,
  vp.speed,
  vp.latitude,
  vp.longitude
FROM public.vehicle_positions vp
WHERE vp.gps_time IS NOT NULL
ORDER BY vp.gps_time ASC
LIMIT 50;

-- 2) Count stale vehicles by thresholds
WITH ages AS (
  SELECT
    device_id,
    (now() - gps_time) AS gps_age,
    (now() - last_synced_at) AS sync_age
  FROM public.vehicle_positions
  WHERE gps_time IS NOT NULL
)
SELECT
  COUNT(*) FILTER (WHERE gps_age > interval '10 minutes') AS gps_stale_10m,
  COUNT(*) FILTER (WHERE gps_age > interval '60 minutes') AS gps_stale_60m,
  COUNT(*) FILTER (WHERE sync_age > interval '10 minutes') AS sync_stale_10m,
  COUNT(*) FILTER (WHERE sync_age > interval '60 minutes') AS sync_stale_60m
FROM ages;

-- 3) Single device check (edit device_id as needed)
-- SELECT
--   device_id,
--   gps_time,
--   last_synced_at,
--   now() - gps_time AS gps_age,
--   now() - last_synced_at AS sync_age,
--   speed,
--   is_online
-- FROM public.vehicle_positions
-- WHERE device_id = '358657105966092';

