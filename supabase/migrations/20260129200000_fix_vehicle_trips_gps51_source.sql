-- Migration: Fix Vehicle Trips to use GPS51 as single source of truth
-- Description:
-- 1. Convert vehicle_trips from VIEW back to TABLE
-- 2. Add source column with proper filtering
-- 3. Update all RPC functions to filter by source='gps51'
-- 4. Update vehicle_daily_stats view to only count GPS51 trips
--
-- This fixes the issue where 71 trips are shown instead of 3 (matching GPS51)

-- =====================================================
-- 1. Drop the vehicle_trips VIEW and recreate as TABLE
-- =====================================================

-- Safely drop vehicle_trips (whether it's a table or view)
DO $$
BEGIN
  -- Try to drop as VIEW first
  BEGIN
    DROP VIEW IF EXISTS public.vehicle_trips CASCADE;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Try to drop as TABLE
  BEGIN
    DROP TABLE IF EXISTS public.vehicle_trips CASCADE;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- Create vehicle_trips as a TABLE with source column
CREATE TABLE IF NOT EXISTS public.vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    start_latitude DOUBLE PRECISION DEFAULT 0,
    start_longitude DOUBLE PRECISION DEFAULT 0,
    end_latitude DOUBLE PRECISION DEFAULT 0,
    end_longitude DOUBLE PRECISION DEFAULT 0,
    distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_speed NUMERIC(6, 1),
    avg_speed NUMERIC(6, 1),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'gps51', -- CRITICAL: Track data source
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraint: source must be valid
    CONSTRAINT valid_source CHECK (source IN ('gps51', 'gps51_parity', 'position_history', 'manual'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_id_start_time
    ON public.vehicle_trips(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_time
    ON public.vehicle_trips(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_source
    ON public.vehicle_trips(source);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_source
    ON public.vehicle_trips(device_id, source);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing
    ON public.vehicle_trips(device_id, start_time, end_time)
    WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

-- =====================================================
-- 2. Enable RLS and set up policies
-- =====================================================

ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view vehicle trips for assigned vehicles" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Allow service role to insert vehicle trips" ON public.vehicle_trips;
DROP POLICY IF EXISTS "Allow authenticated read access to vehicle trips" ON public.vehicle_trips;

-- Policy for authenticated users to view their vehicles' trips
CREATE POLICY "Users can view vehicle trips for assigned vehicles" ON public.vehicle_trips
    FOR SELECT USING (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
            SELECT 1 FROM public.vehicle_assignments va
            JOIN public.profiles p ON p.id = va.profile_id
            WHERE va.device_id = vehicle_trips.device_id AND p.user_id = auth.uid()
        )
    );

-- Policy for service role to insert/update trips
CREATE POLICY "Allow service role to insert vehicle trips" ON public.vehicle_trips
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Allow service role to update vehicle trips" ON public.vehicle_trips
    FOR UPDATE USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON public.vehicle_trips TO authenticated;
GRANT SELECT ON public.vehicle_trips TO anon;
GRANT ALL ON public.vehicle_trips TO service_role;

-- =====================================================
-- 3. Update get_vehicle_mileage_stats to filter by source='gps51'
-- =====================================================

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

  -- CRITICAL: Only count GPS51 trips for accurate parity
  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_today_km, v_trips_today
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source = 'gps51'  -- FILTER BY GPS51 SOURCE
    AND t.start_time >= v_today_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT
    COALESCE(SUM(t.distance_km), 0),
    COALESCE(COUNT(*)::BIGINT, 0)
  INTO v_week_km, v_trips_week
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source = 'gps51'  -- FILTER BY GPS51 SOURCE
    AND t.start_time >= v_week_start
    AND t.start_time < v_today_start + INTERVAL '1 day';

  SELECT COALESCE(SUM(t.distance_km), 0)
  INTO v_month_km
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND t.source = 'gps51'  -- FILTER BY GPS51 SOURCE
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

COMMENT ON FUNCTION public.get_vehicle_mileage_stats IS 'Returns today/week/month mileage and trip counts for dashboard. ONLY counts GPS51-sourced trips.';

-- =====================================================
-- 4. Update get_daily_mileage to filter by source='gps51'
-- =====================================================

DROP FUNCTION IF EXISTS public.get_daily_mileage(TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.get_daily_mileage(TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.get_daily_mileage(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  day TEXT,
  date DATE,
  distance NUMERIC,
  trips BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    -- Generate series of dates for the requested period
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date AS d
  ),
  daily_stats AS (
    -- Aggregate trip data by day - ONLY GPS51 TRIPS
    SELECT
      DATE(t.start_time) AS trip_date,
      COALESCE(SUM(t.distance_km), 0) AS total_distance_km,
      COUNT(*) AS trip_count
    FROM vehicle_trips t
    WHERE t.device_id = p_device_id
      AND t.source = 'gps51'  -- FILTER BY GPS51 SOURCE
      AND t.start_time >= CURRENT_DATE - (p_days - 1)
      AND t.start_time < CURRENT_DATE + 1
      AND t.end_time IS NOT NULL
    GROUP BY DATE(t.start_time)
  )
  SELECT
    TO_CHAR(ds.d, 'Dy') AS day,
    ds.d AS date,
    COALESCE(ROUND(daily.total_distance_km::numeric, 2), 0) AS distance,
    COALESCE(daily.trip_count, 0) AS trips
  FROM date_series ds
  LEFT JOIN daily_stats daily ON ds.d = daily.trip_date
  ORDER BY ds.d DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_mileage(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_mileage(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_daily_mileage(TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.get_daily_mileage(TEXT, INTEGER) IS 'Returns daily mileage statistics for a vehicle. ONLY counts GPS51-sourced trips.';

-- =====================================================
-- 5. Update vehicle_daily_stats view to filter by source='gps51'
-- =====================================================

DROP VIEW IF EXISTS public.vehicle_daily_stats CASCADE;

CREATE VIEW public.vehicle_daily_stats AS
SELECT
  device_id,
  date_trunc('day', start_time)::date AS stat_date,
  COUNT(*)::integer AS trip_count,
  ROUND(SUM(distance_km)::numeric, 2) AS total_distance_km,
  ROUND(AVG(distance_km)::numeric, 2) AS avg_distance_km,
  ROUND(MAX(max_speed)::numeric, 1) AS peak_speed,
  ROUND(AVG(avg_speed)::numeric, 1) AS avg_speed,
  COALESCE(SUM(duration_seconds), 0)::integer AS total_duration_seconds,
  MIN(start_time) AS first_trip_start,
  MAX(end_time) AS last_trip_end
FROM public.vehicle_trips
WHERE start_time >= NOW() - INTERVAL '90 days'
  AND source = 'gps51'  -- CRITICAL: Only count GPS51 trips
GROUP BY device_id, date_trunc('day', start_time)::date
ORDER BY device_id, stat_date DESC;

COMMENT ON VIEW public.vehicle_daily_stats IS 'Pre-calculated daily vehicle statistics. ONLY includes GPS51-sourced trips for accurate parity.';

GRANT SELECT ON public.vehicle_daily_stats TO authenticated;
GRANT SELECT ON public.vehicle_daily_stats TO anon;
GRANT SELECT ON public.vehicle_daily_stats TO service_role;

-- =====================================================
-- 6. Create get_vehicle_daily_stats RPC (if used)
-- =====================================================

DROP FUNCTION IF EXISTS public.get_vehicle_daily_stats(TEXT, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.get_vehicle_daily_stats(
  p_device_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  device_id TEXT,
  stat_date DATE,
  trip_count INTEGER,
  total_distance_km NUMERIC,
  avg_distance_km NUMERIC,
  peak_speed NUMERIC,
  avg_speed NUMERIC,
  total_duration_seconds INTEGER,
  first_trip_start TIMESTAMPTZ,
  last_trip_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vds.device_id,
    vds.stat_date,
    vds.trip_count,
    vds.total_distance_km,
    vds.avg_distance_km,
    vds.peak_speed,
    vds.avg_speed,
    vds.total_duration_seconds,
    vds.first_trip_start,
    vds.last_trip_end
  FROM public.vehicle_daily_stats vds
  WHERE vds.device_id = p_device_id
    AND vds.stat_date >= CURRENT_DATE - p_days
  ORDER BY vds.stat_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_vehicle_daily_stats(TEXT, INTEGER) TO service_role;

-- =====================================================
-- 7. Enable realtime for vehicle_trips (now that it's a table)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicle_trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_trips;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Publication might not exist in some environments
  NULL;
END;
$$;

-- Full replica identity for realtime updates
ALTER TABLE public.vehicle_trips REPLICA IDENTITY FULL;

-- =====================================================
-- Summary of changes:
-- =====================================================
-- 1. vehicle_trips is now a TABLE (not a VIEW)
-- 2. Added 'source' column with constraint (gps51, gps51_parity, position_history, manual)
-- 3. get_vehicle_mileage_stats now filters by source='gps51'
-- 4. get_daily_mileage now filters by source='gps51'
-- 5. vehicle_daily_stats view now filters by source='gps51'
-- 6. Realtime enabled for vehicle_trips table
--
-- Frontend already filters by source='gps51' in useVehicleTrips hook
-- GPS51 sync functions already insert with source='gps51'
-- =====================================================
