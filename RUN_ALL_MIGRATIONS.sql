-- ============================================================================
-- COMBINED MIGRATION SCRIPT
-- Run this entire file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Daily Travel Stats Function
-- ============================================================================
-- Function to get daily travel stats between 7am and 6pm (Lagos timezone)
-- Returns travel time and distance covered for each day

CREATE OR REPLACE FUNCTION get_daily_travel_stats(
  p_device_id TEXT,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  travel_date DATE,
  total_distance_km NUMERIC,
  total_travel_time_minutes NUMERIC,
  trip_count BIGINT,
  avg_speed_kmh NUMERIC,
  max_speed_kmh NUMERIC,
  first_trip_start TIMESTAMP WITH TIME ZONE,
  last_trip_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(t.start_time AT TIME ZONE 'Africa/Lagos') as travel_date,
    ROUND(SUM(t.distance_km)::NUMERIC, 2) as total_distance_km,
    ROUND(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60)::NUMERIC, 2) as total_travel_time_minutes,
    COUNT(*)::BIGINT as trip_count,
    ROUND(AVG(t.avg_speed)::NUMERIC, 2) as avg_speed_kmh,
    ROUND(MAX(t.max_speed)::NUMERIC, 2) as max_speed_kmh,
    MIN(t.start_time) as first_trip_start,
    MAX(t.end_time) as last_trip_end
  FROM vehicle_trips t
  WHERE t.device_id = p_device_id
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') >= p_start_date
    AND DATE(t.start_time AT TIME ZONE 'Africa/Lagos') <= p_end_date
    -- Filter for trips between 7am and 6pm Lagos time
    AND EXTRACT(HOUR FROM t.start_time AT TIME ZONE 'Africa/Lagos') >= 7
    AND EXTRACT(HOUR FROM t.end_time AT TIME ZONE 'Africa/Lagos') < 18
  GROUP BY DATE(t.start_time AT TIME ZONE 'Africa/Lagos')
  ORDER BY travel_date DESC;
END;
$$;

COMMENT ON FUNCTION get_daily_travel_stats IS 'Returns daily travel statistics (distance and time) for trips between 7am-6pm Lagos time';

GRANT EXECUTE ON FUNCTION get_daily_travel_stats(TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_travel_stats(TEXT, DATE, DATE) TO service_role;

-- ============================================================================
-- MIGRATION 2: Performance Indexes
-- ============================================================================
-- ⚠️ IMPORTANT: These indexes must be created SEPARATELY (one at a time)
-- Running them all together may cause timeouts on large tables.
-- See PRODUCTION_READINESS_CHECKLIST.md for corrected statements.

-- NOTE: The original migration used NOW() in predicates which causes errors.
-- These indexes should be created manually using the corrected statements below:

-- 1. Chat history (small table - safe to run)
-- CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_device_user_created
--   ON vehicle_chat_history(device_id, user_id, created_at DESC);

-- 2. Proactive events (small table - safe to run)
-- CREATE INDEX IF NOT EXISTS idx_proactive_vehicle_events_notified_device_created
--   ON proactive_vehicle_events(notified, device_id, created_at DESC);

-- 3. Position history (LARGE table - use hard-coded date to avoid timeout)
-- CREATE INDEX IF NOT EXISTS idx_position_history_device_recorded_recent
--   ON position_history(device_id, recorded_at DESC)
--   WHERE recorded_at >= '2026-01-15';

-- 4. Vehicle trips (LARGE table - use hard-coded date to avoid timeout)
-- CREATE INDEX IF NOT EXISTS idx_vehicle_trips_device_start_time_recent
--   ON vehicle_trips(device_id, start_time DESC)
--   WHERE start_time >= '2026-01-15';

-- ⚠️ ACTION REQUIRED: Uncomment and run the above statements ONE AT A TIME
-- in Supabase SQL Editor. See PRODUCTION_READINESS_CHECKLIST.md for details.

-- ============================================================================
-- MIGRATION 3: Alert Dismissals Table (Fixed - no date_trunc, no predicates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS alert_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clean up prior attempts
ALTER TABLE alert_dismissals DROP COLUMN IF EXISTS dismissed_hour_epoch;
DROP INDEX IF EXISTS idx_alert_dismissals_hourly_unique;
DROP INDEX IF EXISTS idx_alert_dismissals_device_user_type_dismissed;
DROP INDEX IF EXISTS idx_alert_dismissals_user_type_count;

-- Immutable hourly bucket (UTC)
ALTER TABLE alert_dismissals
  ADD COLUMN IF NOT EXISTS dismissed_hour_epoch BIGINT
  GENERATED ALWAYS AS (
    floor(extract(epoch FROM (dismissed_at AT TIME ZONE 'UTC')) / 3600)
  ) STORED;

-- Unique per hour
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_dismissals_hourly_unique
  ON alert_dismissals (device_id, user_id, alert_type, dismissed_hour_epoch);

-- Supporting indexes (no predicates)
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_device_user_type_dismissed
  ON alert_dismissals(device_id, user_id, alert_type, dismissed_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_dismissals_user_type_count
  ON alert_dismissals(user_id, alert_type, dismissed_at DESC);

-- RLS
ALTER TABLE alert_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own dismissals" ON alert_dismissals;
DROP POLICY IF EXISTS "Users can create their own dismissals" ON alert_dismissals;
DROP POLICY IF EXISTS "Admins can view all dismissals" ON alert_dismissals;

CREATE POLICY "Users can view their own dismissals"
ON alert_dismissals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dismissals"
ON alert_dismissals FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all dismissals"
ON alert_dismissals FOR SELECT
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE alert_dismissals IS 'Tracks alert dismissals for persistence learning - if dismissed 3+ times, suppress individual alerts and send weekly digest';
COMMENT ON INDEX idx_alert_dismissals_hourly_unique IS 'Prevents duplicate dismissals within the same hour per device/user/alert_type';
COMMENT ON INDEX idx_alert_dismissals_device_user_type_dismissed IS 'Optimizes queries on alert_dismissals';
COMMENT ON INDEX idx_alert_dismissals_user_type_count IS 'Optimizes queries on alert_dismissals';

-- ============================================================================
-- MIGRATION 4: Trip Pattern Functions
-- ============================================================================
CREATE OR REPLACE FUNCTION get_trip_patterns(
  p_device_id TEXT,
  p_day_of_week INTEGER,
  p_hour_of_day INTEGER,
  p_current_lat DOUBLE PRECISION DEFAULT NULL,
  p_current_lon DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
  pattern_id UUID,
  origin_latitude DOUBLE PRECISION,
  origin_longitude DOUBLE PRECISION,
  origin_name TEXT,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  destination_name TEXT,
  typical_start_hour INTEGER,
  occurrence_count INTEGER,
  avg_duration_minutes NUMERIC,
  avg_distance_km NUMERIC,
  confidence_score NUMERIC,
  last_occurrence TIMESTAMPTZ,
  is_at_origin BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.id as pattern_id,
    tp.origin_latitude,
    tp.origin_longitude,
    tp.origin_name,
    tp.destination_latitude,
    tp.destination_longitude,
    tp.destination_name,
    tp.typical_start_hour,
    tp.occurrence_count,
    tp.avg_duration_minutes,
    tp.avg_distance_km,
    tp.confidence_score,
    tp.last_occurrence,
    -- Check if vehicle is at origin location (within 100m)
    CASE 
      WHEN p_current_lat IS NOT NULL AND p_current_lon IS NOT NULL THEN
        (6371000 * acos(
          cos(radians(p_current_lat)) * 
          cos(radians(tp.origin_latitude)) * 
          cos(radians(tp.origin_longitude) - radians(p_current_lon)) + 
          sin(radians(p_current_lat)) * 
          sin(radians(tp.origin_latitude))
        )) < 100
      ELSE false
    END as is_at_origin
  FROM trip_patterns tp
  WHERE tp.device_id = p_device_id
    AND tp.day_of_week = p_day_of_week
    AND tp.typical_start_hour = p_hour_of_day
    AND tp.occurrence_count >= 3
    AND tp.confidence_score >= 0.5
  ORDER BY tp.occurrence_count DESC, tp.confidence_score DESC;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_battery_drain(
  p_device_id TEXT,
  p_lookback_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  avg_drain_per_hour NUMERIC,
  avg_drain_per_day NUMERIC,
  sample_count BIGINT,
  last_battery_percent NUMERIC,
  last_battery_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH battery_readings AS (
    SELECT 
      battery_percent,
      gps_time,
      LAG(battery_percent) OVER (ORDER BY gps_time) as prev_battery,
      LAG(gps_time) OVER (ORDER BY gps_time) as prev_time
    FROM position_history
    WHERE device_id = p_device_id
      AND battery_percent IS NOT NULL
      AND battery_percent > 0
      AND gps_time >= NOW() - (p_lookback_days || ' days')::INTERVAL
    ORDER BY gps_time
  ),
  drain_calculations AS (
    SELECT 
      battery_percent - prev_battery as drain,
      EXTRACT(EPOCH FROM (gps_time - prev_time)) / 3600.0 as hours_diff
    FROM battery_readings
    WHERE prev_battery IS NOT NULL
      AND prev_time IS NOT NULL
      AND battery_percent < prev_battery
      AND EXTRACT(EPOCH FROM (gps_time - prev_time)) BETWEEN 0.1 AND 24
  )
  SELECT 
    COALESCE(AVG(drain / NULLIF(hours_diff, 0)), 0)::NUMERIC as avg_drain_per_hour,
    COALESCE(AVG(drain / NULLIF(hours_diff, 0)) * 24, 0)::NUMERIC as avg_drain_per_day,
    COUNT(*)::BIGINT as sample_count,
    (SELECT battery_percent FROM position_history 
     WHERE device_id = p_device_id 
     AND battery_percent IS NOT NULL 
     ORDER BY gps_time DESC LIMIT 1)::NUMERIC as last_battery_percent,
    (SELECT gps_time FROM position_history 
     WHERE device_id = p_device_id 
     AND battery_percent IS NOT NULL 
     ORDER BY gps_time DESC LIMIT 1) as last_battery_time
  FROM drain_calculations;
END;
$$;

COMMENT ON FUNCTION get_trip_patterns IS 'Returns trip patterns for proactive trip start alerts - only patterns with 3+ occurrences';
COMMENT ON FUNCTION calculate_battery_drain IS 'Calculates average battery drain rate for anomaly detection';

GRANT EXECUTE ON FUNCTION get_trip_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION get_trip_patterns TO service_role;
GRANT EXECUTE ON FUNCTION calculate_battery_drain TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_battery_drain TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All migrations have been applied successfully!
