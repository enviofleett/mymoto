-- Resource-light cleanup + efficient latest history lookup

-- 1) Efficient latest history lookup per device
CREATE OR REPLACE FUNCTION public.get_last_position_history(device_ids text[])
RETURNS TABLE (
  device_id text,
  latitude double precision,
  longitude double precision,
  recorded_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (device_id)
    device_id,
    latitude,
    longitude,
    recorded_at
  FROM public.position_history
  WHERE device_id = ANY (device_ids)
  ORDER BY device_id, recorded_at DESC;
$$;

COMMENT ON FUNCTION public.get_last_position_history(text[]) IS
'Returns the latest position_history row per device_id for a given device list.';

-- 2) Ensure cleanup-friendly indexes exist (idempotent + safe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'position_history'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_position_history_recorded_at
      ON public.position_history(recorded_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'vehicle_chat_history'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_created_at
      ON public.vehicle_chat_history(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'proactive_vehicle_events'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_proactive_vehicle_events_created_at
      ON public.proactive_vehicle_events(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'fleet_insights_history'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_fleet_insights_history_created_at
      ON public.fleet_insights_history(created_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'gps_api_logs'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_gps_api_logs_created_at
      ON public.gps_api_logs(created_at DESC);
  END IF;
END;
$$;

-- 3) Batched cleanup function (small, resource-light deletions)
CREATE OR REPLACE FUNCTION public.run_resource_cleanup(
  position_history_days int DEFAULT 30,
  chat_history_days int DEFAULT 90,
  events_days int DEFAULT 7,
  api_logs_days int DEFAULT 7,
  insights_days int DEFAULT 30,
  position_batch int DEFAULT 5000,
  chat_batch int DEFAULT 2000,
  events_batch int DEFAULT 2000,
  api_batch int DEFAULT 2000,
  insights_batch int DEFAULT 2000
)
RETURNS TABLE (table_name text, deleted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- position_history
  WITH to_delete AS (
    SELECT ctid
    FROM public.position_history
    WHERE recorded_at < now() - make_interval(days => position_history_days)
    LIMIT position_batch
  )
  DELETE FROM public.position_history ph
  USING to_delete
  WHERE ph.ctid = to_delete.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'position_history';
  deleted_count := COALESCE(v_deleted, 0);
  RETURN NEXT;

  -- vehicle_chat_history
  WITH to_delete AS (
    SELECT ctid
    FROM public.vehicle_chat_history
    WHERE created_at < now() - make_interval(days => chat_history_days)
    LIMIT chat_batch
  )
  DELETE FROM public.vehicle_chat_history ch
  USING to_delete
  WHERE ch.ctid = to_delete.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'vehicle_chat_history';
  deleted_count := COALESCE(v_deleted, 0);
  RETURN NEXT;

  -- proactive_vehicle_events
  WITH to_delete AS (
    SELECT ctid
    FROM public.proactive_vehicle_events
    WHERE created_at < now() - make_interval(days => events_days)
    LIMIT events_batch
  )
  DELETE FROM public.proactive_vehicle_events pve
  USING to_delete
  WHERE pve.ctid = to_delete.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'proactive_vehicle_events';
  deleted_count := COALESCE(v_deleted, 0);
  RETURN NEXT;

  -- gps_api_logs
  WITH to_delete AS (
    SELECT ctid
    FROM public.gps_api_logs
    WHERE created_at < now() - make_interval(days => api_logs_days)
    LIMIT api_batch
  )
  DELETE FROM public.gps_api_logs gal
  USING to_delete
  WHERE gal.ctid = to_delete.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'gps_api_logs';
  deleted_count := COALESCE(v_deleted, 0);
  RETURN NEXT;

  -- fleet_insights_history
  WITH to_delete AS (
    SELECT ctid
    FROM public.fleet_insights_history
    WHERE created_at < now() - make_interval(days => insights_days)
    LIMIT insights_batch
  )
  DELETE FROM public.fleet_insights_history fih
  USING to_delete
  WHERE fih.ctid = to_delete.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'fleet_insights_history';
  deleted_count := COALESCE(v_deleted, 0);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.run_resource_cleanup IS
'Resource-light cleanup: small batched deletes for telemetry + logs + chats.';

-- 4) Schedule cleanup hourly (small batches, low impact)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'resource-cleanup-hourly';
  END IF;
END;
$$;

SELECT cron.schedule(
  'resource-cleanup-hourly',
  '15 * * * *',
  $$
  SELECT public.run_resource_cleanup();
  $$
);
