-- Migration: Fix PWA Core Systems (Trips Table, Map RLS, Mileage RPC)
-- Description: Drop vehicle_trips VIEW, ensure TABLE exists; add vehicle_positions SELECT policy; create get_vehicle_mileage_stats.
-- Note: Uses 20260125150000 to avoid conflict with 20260125000000_feature_flags_and_staleness_monitoring.

-- =====================================================
-- 1. Drop vehicle_trips VIEW only if it's a VIEW; ensure TABLE exists
-- =====================================================
-- The VIEW (20260109120000) is read-only; process-trips/sync-trips INSERT into vehicle_trips.
-- Drop VIEW only when vehicle_trips is a view. If it's already a table, skip drop.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'vehicle_trips'
  ) THEN
    DROP VIEW IF EXISTS public.vehicle_trips CASCADE;
  END IF;
END;
$$;

-- Create TABLE if not present (e.g. 20260124000003 failed because VIEW existed).
CREATE TABLE IF NOT EXISTS public.vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL REFERENCES public.vehicles(device_id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    start_latitude DOUBLE PRECISION NOT NULL,
    start_longitude DOUBLE PRECISION NOT NULL,
    end_latitude DOUBLE PRECISION NOT NULL,
    end_longitude DOUBLE PRECISION NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL,
    max_speed NUMERIC(6, 1),
    avg_speed NUMERIC(6, 1),
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_id_start_time ON public.vehicle_trips(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_time ON public.vehicle_trips(start_time DESC);

-- Remove duplicates before unique index: keep one row per (device_id, start_time, end_time).
DELETE FROM public.vehicle_trips a
USING public.vehicle_trips b
WHERE a.device_id = b.device_id
  AND a.start_time = b.start_time
  AND a.end_time = b.end_time
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing
  ON public.vehicle_trips(device_id, start_time, end_time)
  WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access to vehicle trips" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Allow vehicle owners/providers to view vehicle trips" ON public.vehicle_trips;

CREATE POLICY "Users can view vehicle trips for assigned vehicles" ON public.vehicle_trips
    FOR SELECT USING (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
            SELECT 1 FROM public.vehicle_assignments va
            JOIN public.profiles p ON p.id = va.profile_id
            WHERE va.device_id = vehicle_trips.device_id AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow service role to insert vehicle trips" ON public.vehicle_trips;
CREATE POLICY "Allow service role to insert vehicle trips" ON public.vehicle_trips
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.vehicle_trips TO authenticated;
GRANT SELECT ON public.vehicle_trips TO anon;

-- =====================================================
-- 2. Fix RLS for Map: vehicle_positions SELECT for authenticated
-- =====================================================
-- Realtime postgres_changes require SELECT; RLS can block events.

ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.vehicle_positions;
CREATE POLICY "Enable read access for authenticated users"
  ON public.vehicle_positions
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- 3. get_vehicle_mileage_stats RPC (today / week / month)
-- =====================================================
-- Returns JSONB: { today, week, month, trips_today, trips_week }.
-- Stops dashboard crash when RPC was missing.
-- Drop first if return type changed (CREATE OR REPLACE cannot change it).

DROP FUNCTION IF EXISTS public.get_vehicle_mileage_stats(TEXT) CASCADE;

CREATE FUNCTION public.get_vehicle_mileage_stats(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_km NUMERIC := 0;
  v_week_km NUMERIC := 0;
  v_month_km NUMERIC := 0;
  v_trips_today BIGINT := 0;
  v_trips_week BIGINT := 0;
  v_today_start TIMESTAMPTZ;
  v_week_start TIMESTAMPTZ;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_today_start := date_trunc('day', (NOW() AT TIME ZONE 'Africa/Lagos')) AT TIME ZONE 'Africa/Lagos';
  v_week_start := v_today_start - INTERVAL '7 days';
  v_month_start := v_today_start - INTERVAL '30 days';

  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_today_km, v_trips_today
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.start_time >= v_today_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_week_km, v_trips_week
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.start_time >= v_week_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT COALESCE(SUM(t.distance_km), 0)
  INTO v_month_km
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.start_time >= v_month_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  RETURN jsonb_build_object(
    'today', ROUND(v_today_km::numeric, 2),
    'week', ROUND(v_week_km::numeric, 2),
    'month', ROUND(v_month_km::numeric, 2),
    'trips_today', v_trips_today,
    'trips_week', v_trips_week
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_mileage_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_mileage_stats(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_mileage_stats(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_vehicle_mileage_stats IS 'Returns today/week/month mileage and trip counts for dashboard; used by useVehicleProfile.';
