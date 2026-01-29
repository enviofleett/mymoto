-- Phase 5: Realtime allowlist automation + staleness monitoring views/snapshots
-- Safe-by-default:
-- - If realtime_vehicle_positions_enabled is false, allowlist refresh does nothing.
-- - Snapshotting is read-only (inserts into snapshots table) and can be used for dashboards.

-- ============
-- 1) Monitoring view (gps_time vs last_synced_at)
-- ============
DROP VIEW IF EXISTS public.v_vehicle_staleness;
CREATE OR REPLACE VIEW public.v_vehicle_staleness AS
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
WHERE vp.gps_time IS NOT NULL AND vp.last_synced_at IS NOT NULL;

COMMENT ON VIEW public.v_vehicle_staleness IS
'Staleness view comparing gps_time freshness vs backend last_synced_at heartbeat.';

-- ============
-- 2) Snapshot table for dashboards
-- ============
CREATE TABLE IF NOT EXISTS public.vehicle_staleness_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_vehicles BIGINT NOT NULL,
  synced_le_2m BIGINT NOT NULL,
  synced_le_5m BIGINT NOT NULL,
  synced_le_10m BIGINT NOT NULL,
  gps_le_2m BIGINT NOT NULL,
  gps_le_5m BIGINT NOT NULL,
  gps_le_10m BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_staleness_snapshots_time
  ON public.vehicle_staleness_snapshots (recorded_at DESC);

ALTER TABLE public.vehicle_staleness_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read staleness snapshots" ON public.vehicle_staleness_snapshots;
CREATE POLICY "Admins can read staleness snapshots"
  ON public.vehicle_staleness_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- No insert policy needed: cron/postgres/service role can insert.

-- ============
-- 3) Snapshot function (insert one row)
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
  SELECT COUNT(*) INTO v_total FROM public.vehicle_positions
  WHERE last_synced_at IS NOT NULL AND gps_time IS NOT NULL;

  SELECT
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '2 minutes'),
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '5 minutes'),
    COUNT(*) FILTER (WHERE now() - last_synced_at <= interval '10 minutes'),
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '2 minutes'),
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '5 minutes'),
    COUNT(*) FILTER (WHERE now() - gps_time <= interval '10 minutes')
  INTO
    v_synced_le_2m,
    v_synced_le_5m,
    v_synced_le_10m,
    v_gps_le_2m,
    v_gps_le_5m,
    v_gps_le_10m
  FROM public.vehicle_positions
  WHERE last_synced_at IS NOT NULL AND gps_time IS NOT NULL;

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

COMMENT ON FUNCTION public.take_vehicle_staleness_snapshot IS
'Insert a fleet staleness snapshot (gps_time vs last_synced_at) for dashboards.';

-- ============
-- 4) Realtime allowlist auto-refresh (safe gating)
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
  -- Only run if global flag is enabled
  SELECT enabled INTO v_flag_enabled
  FROM public.feature_flags
  WHERE key = 'realtime_vehicle_positions_enabled';

  IF COALESCE(v_flag_enabled, FALSE) = FALSE THEN
    RETURN;
  END IF;

  -- Read optional config from feature_flags.config
  SELECT
    COALESCE(NULLIF((config->>'max_devices')::int, 0), v_max_devices),
    COALESCE(NULLIF((config->>'freshness_minutes')::int, 0), v_freshness_minutes)
  INTO v_max_devices, v_freshness_minutes
  FROM public.feature_flags
  WHERE key = 'realtime_vehicle_positions_enabled';

  -- Upsert allowlist entries for fresh devices
  INSERT INTO public.feature_flag_devices (flag_key, device_id, enabled, note)
  SELECT
    'realtime_vehicle_positions_enabled',
    vp.device_id,
    TRUE,
    format('Auto allowlist: gps_age<=%sm', v_freshness_minutes)
  FROM public.vehicle_positions vp
  WHERE vp.gps_time >= now() - (v_freshness_minutes::text || ' minutes')::interval
  ORDER BY vp.gps_time DESC
  LIMIT v_max_devices
  ON CONFLICT (flag_key, device_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      note = EXCLUDED.note,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.refresh_realtime_allowlist IS
'Auto-populate realtime_vehicle_positions_enabled allowlist for fresh devices (gps_time within freshness_minutes), capped by max_devices.';

-- ============
-- 5) Cron job (optional, safe because function no-ops when flag disabled)
-- ============
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- GRANT USAGE ON SCHEMA cron TO postgres;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule every 2 minutes: refresh allowlist + snapshot
-- Note: cron.job naming differs across environments; we identify by command if needed.
SELECT cron.schedule(
  'realtime-allowlist-and-staleness-2min',
  '*/2 * * * *',
  $$
  SELECT public.refresh_realtime_allowlist();
  SELECT public.take_vehicle_staleness_snapshot();
  $$
);

