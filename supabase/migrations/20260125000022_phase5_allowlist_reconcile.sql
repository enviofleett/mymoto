-- Phase 5.2: Make realtime allowlist bounded (no accumulation)
--
-- Problem:
-- refresh_realtime_allowlist() upserts "fresh" devices to enabled=true, but never disables
-- older auto-allowlisted devices. Over time, enabled count grows beyond max_devices.
--
-- Fix:
-- Each run:
-- - compute selected device_ids (top N freshest by gps_time within freshness window)
-- - upsert those as enabled=true with the Auto allowlist note
-- - disable any previously auto-allowlisted devices that are no longer selected

CREATE OR REPLACE FUNCTION public.refresh_realtime_allowlist()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag_enabled BOOLEAN;
  v_max_devices INT := 50;
  v_freshness_minutes INT := 2;
  v_selected_device_ids TEXT[];
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

  -- Pick the bounded set of devices to keep allowlisted
  SELECT COALESCE(array_agg(device_id), ARRAY[]::text[])
  INTO v_selected_device_ids
  FROM (
    SELECT vp.device_id
    FROM public.vehicle_positions vp
    WHERE vp.gps_time >= now() - (v_freshness_minutes::text || ' minutes')::interval
      AND vp.gps_time <= now() + interval '5 minutes'
      AND vp.gps_time >= TIMESTAMPTZ '2000-01-01'
    ORDER BY vp.gps_time DESC
    LIMIT v_max_devices
  ) s;

  -- Upsert selected as enabled=true
  INSERT INTO public.feature_flag_devices (flag_key, device_id, enabled, note)
  SELECT
    'realtime_vehicle_positions_enabled',
    device_id,
    TRUE,
    format('Auto allowlist: gps_age<=%sm', v_freshness_minutes)
  FROM unnest(v_selected_device_ids) AS device_id
  ON CONFLICT (flag_key, device_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      note = EXCLUDED.note,
      updated_at = now();

  -- Disable devices that were auto-allowlisted before but are no longer selected
  UPDATE public.feature_flag_devices ffd
  SET enabled = FALSE,
      note = 'Auto allowlist: removed (no longer in top-N fresh set)',
      updated_at = now()
  WHERE ffd.flag_key = 'realtime_vehicle_positions_enabled'
    AND ffd.note LIKE 'Auto allowlist:%'
    AND NOT (ffd.device_id = ANY (v_selected_device_ids));
END;
$$;

COMMENT ON FUNCTION public.refresh_realtime_allowlist IS
'Auto-populate realtime_vehicle_positions_enabled allowlist for fresh devices, bounded by max_devices; disables older auto-allowlisted devices outside the selected set.';

