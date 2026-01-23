-- Phase 5.1: Harden allowlist + monitoring against invalid/future gps_time
--
-- Observed issues:
-- - gps_time can be wildly invalid (e.g., year 0165)
-- - gps_time can be future-dated, leading to negative gps_age and incorrect allowlisting
--
-- Fixes:
-- 1) Clamp/annotate gps_age in view (avoid negative ages; expose future flag)
-- 2) Make snapshots + allowlist ignore invalid/future gps_time

-- ============
-- 1) Safer staleness view
-- ============
-- NOTE: Postgres will not allow CREATE OR REPLACE VIEW to reorder/rename columns.
-- We drop first to ensure the new column list can be applied cleanly.
DROP VIEW IF EXISTS public.v_vehicle_staleness;

CREATE VIEW public.v_vehicle_staleness AS
SELECT
  vp.device_id,
  vp.gps_time,
  vp.last_synced_at,
  -- Flag invalid/future GPS times
  (vp.gps_time > now()) AS gps_time_future,
  (vp.gps_time < TIMESTAMPTZ '2000-01-01') AS gps_time_unreasonable,
  -- Clamp gps_age to >= 0 for dashboards
  GREATEST(now() - vp.gps_time, interval '0') AS gps_age,
  (now() - vp.last_synced_at) AS sync_age,
  vp.is_online,
  vp.speed,
  vp.latitude,
  vp.longitude
FROM public.vehicle_positions vp
WHERE vp.gps_time IS NOT NULL AND vp.last_synced_at IS NOT NULL;

COMMENT ON VIEW public.v_vehicle_staleness IS
'Staleness view comparing gps_time freshness vs backend last_synced_at heartbeat. gps_age is clamped to >= 0 and flags indicate future/unreasonable gps_time.';

-- ============
-- 2) Snapshot function: ignore invalid/future gps_time when counting gps_le_* buckets
-- ============
CREATE OR REPLACE FUNCTION public.take_vehicle_staleness_snapshot()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total BIGINT;
  v_synced_le_2m BIGINT;
  v_synced_le_5m BIGINT;
  v_synced_le_10m BIGINT;
  v_gps_le_2m BIGINT;
  v_gps_le_5m BIGINT;
  v_gps_le_10m BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.vehicle_positions
  WHERE last_synced_at IS NOT NULL AND gps_time IS NOT NULL;

  -- Sync buckets: based on last_synced_at only (always safe)
  SELECT
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '2 minutes'),
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '5 minutes'),
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '10 minutes')
  INTO
    v_synced_le_2m,
    v_synced_le_5m,
    v_synced_le_10m
  FROM public.vehicle_positions
  WHERE last_synced_at IS NOT NULL;

  -- GPS buckets: only count gps_time that is plausible and not in the future
  SELECT
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '2 minutes'),
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '5 minutes'),
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '10 minutes')
  INTO
    v_gps_le_2m,
    v_gps_le_5m,
    v_gps_le_10m
  FROM public.vehicle_positions
  WHERE gps_time IS NOT NULL
    AND gps_time <= now() + interval '5 minutes'
    AND gps_time >= TIMESTAMPTZ '2000-01-01';

  INSERT INTO public.vehicle_staleness_snapshots (
    total_vehicles,
    synced_le_2m,
    synced_le_5m,
    synced_le_10m,
    gps_le_2m,
    gps_le_5m,
    gps_le_10m
  ) VALUES (
    COALESCE(v_total, 0),
    COALESCE(v_synced_le_2m, 0),
    COALESCE(v_synced_le_5m, 0),
    COALESCE(v_synced_le_10m, 0),
    COALESCE(v_gps_le_2m, 0),
    COALESCE(v_gps_le_5m, 0),
    COALESCE(v_gps_le_10m, 0)
  );
END;
$$;

-- ============
-- 3) Realtime allowlist auto-refresh: ignore invalid/future gps_time
-- ============
CREATE OR REPLACE FUNCTION public.refresh_realtime_allowlist()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag_enabled BOOLEAN;
  v_max_devices INT := 50;
  v_freshness_minutes INT := 2;
BEGIN
  SELECT enabled INTO v_flag_enabled
  FROM public.feature_flags
  WHERE key = 'realtime_vehicle_positions_enabled';

  IF COALESCE(v_flag_enabled, FALSE) = FALSE THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(NULLIF((config->>'max_devices')::int, 0), v_max_devices),
    COALESCE(NULLIF((config->>'freshness_minutes')::int, 0), v_freshness_minutes)
  INTO v_max_devices, v_freshness_minutes
  FROM public.feature_flags
  WHERE key = 'realtime_vehicle_positions_enabled';

  INSERT INTO public.feature_flag_devices (flag_key, device_id, enabled, note)
  SELECT
    'realtime_vehicle_positions_enabled',
    vp.device_id,
    TRUE,
    format('Auto allowlist: gps_age<=%sm', v_freshness_minutes)
  FROM public.vehicle_positions vp
  WHERE vp.gps_time >= now() - (v_freshness_minutes::text || ' minutes')::interval
    AND vp.gps_time <= now() + interval '5 minutes'
    AND vp.gps_time >= TIMESTAMPTZ '2000-01-01'
  ORDER BY vp.gps_time DESC
  LIMIT v_max_devices
  ON CONFLICT (flag_key, device_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      note = EXCLUDED.note,
      updated_at = now();
END;
$$;

