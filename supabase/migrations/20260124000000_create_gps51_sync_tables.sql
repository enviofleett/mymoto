-- Migration: GPS51 Direct Data Sync Tables
-- Description: Creates tables to store data directly from GPS51 APIs without transformations
-- Purpose: Achieve 100% data accuracy match with GPS51 platform

-- =====================================================
-- 1. GPS51 Trips Table (from querytrips API)
-- =====================================================
-- Stores trip data exactly as returned by GPS51 querytrips API (Section 6)
-- No calculations, no transformations, just direct storage

CREATE TABLE IF NOT EXISTS gps51_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL REFERENCES vehicles(device_id) ON DELETE CASCADE,

  -- Trip timing (exact from GPS51)
  start_time timestamptz NOT NULL,
  end_time timestamptz,

  -- Trip coordinates (exact from GPS51)
  start_latitude numeric,
  start_longitude numeric,
  end_latitude numeric,
  end_longitude numeric,

  -- Trip metrics (exact from GPS51)
  distance_meters integer, -- GPS51's calculated distance (most accurate)
  distance_km numeric GENERATED ALWAYS AS (ROUND((distance_meters / 1000.0)::numeric, 2)) STORED,
  avg_speed_kmh numeric, -- GPS51's calculated average speed
  max_speed_kmh numeric, -- GPS51's calculated max speed
  duration_seconds integer, -- Calculated from start/end time

  -- GPS51 raw data (for debugging and full context)
  gps51_raw_data jsonb, -- Store complete GPS51 response

  -- Metadata
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  -- Constraints (prevent duplicates)
  UNIQUE(device_id, start_time)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_gps51_trips_device_time
  ON gps51_trips(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_gps51_trips_synced
  ON gps51_trips(synced_at DESC);

-- Enable RLS
ALTER TABLE gps51_trips ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view trips for assigned vehicles" ON gps51_trips;
CREATE POLICY "Users can view trips for assigned vehicles"
  ON gps51_trips
  FOR SELECT
  TO authenticated
  USING (
    device_id IN (
      SELECT va.device_id 
      FROM vehicle_assignments va
      JOIN profiles p ON va.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage trips" ON gps51_trips;
CREATE POLICY "Service role can manage trips"
  ON gps51_trips
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON gps51_trips TO authenticated;
GRANT ALL ON gps51_trips TO service_role;

-- =====================================================
-- 2. GPS51 Alarms Table (from position alarm fields)
-- =====================================================
-- Stores alarm data extracted from GPS51 position data (Section 4.1)
-- Fields: alarm, stralarm, stralarmsen, videoalarm, etc.

CREATE TABLE IF NOT EXISTS gps51_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL REFERENCES vehicles(device_id) ON DELETE CASCADE,

  -- Alarm data (exact from GPS51)
  alarm_code bigint NOT NULL, -- GPS51 alarm field (JT808 protocol)
  alarm_description text, -- GPS51 stralarm field (Chinese)
  alarm_description_en text, -- GPS51 stralarmsen field (English)

  -- Video alarms (if available)
  video_alarm_code bigint,
  video_alarm_description text,
  video_alarm_description_en text,

  -- Position when alarm occurred
  latitude numeric,
  longitude numeric,
  speed_kmh numeric,
  altitude numeric,
  heading integer,

  -- Alarm severity (derived from alarm code)
  severity text CHECK (severity IN ('info', 'warning', 'error', 'critical')),

  -- Timing
  alarm_time timestamptz NOT NULL, -- When alarm occurred (GPS51 updatetime or validpoistiontime)
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  -- GPS51 raw data (for full context)
  gps51_raw_data jsonb, -- Store complete position data with alarm

  -- Acknowledgment (for user interaction)
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),

  -- Constraints (prevent duplicate alarms)
  UNIQUE(device_id, alarm_time, alarm_code)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_gps51_alarms_device_time
  ON gps51_alarms(device_id, alarm_time DESC);
CREATE INDEX IF NOT EXISTS idx_gps51_alarms_severity
  ON gps51_alarms(device_id, severity, alarm_time DESC)
  WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_gps51_alarms_synced
  ON gps51_alarms(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps51_alarms_unacknowledged
  ON gps51_alarms(device_id, alarm_time DESC)
  WHERE acknowledged = false;

-- Enable RLS
ALTER TABLE gps51_alarms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view alarms for assigned vehicles" ON gps51_alarms;
CREATE POLICY "Users can view alarms for assigned vehicles"
  ON gps51_alarms
  FOR SELECT
  TO authenticated
  USING (
    device_id IN (
      SELECT va.device_id 
      FROM vehicle_assignments va
      JOIN profiles p ON va.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can acknowledge alarms for assigned vehicles" ON gps51_alarms;
CREATE POLICY "Users can acknowledge alarms for assigned vehicles"
  ON gps51_alarms
  FOR UPDATE
  TO authenticated
  USING (
    device_id IN (
      SELECT va.device_id 
      FROM vehicle_assignments va
      JOIN profiles p ON va.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    device_id IN (
      SELECT va.device_id 
      FROM vehicle_assignments va
      JOIN profiles p ON va.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage alarms" ON gps51_alarms;
CREATE POLICY "Service role can manage alarms"
  ON gps51_alarms
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, UPDATE ON gps51_alarms TO authenticated;
GRANT ALL ON gps51_alarms TO service_role;

-- =====================================================
-- 3. Helper Functions
-- =====================================================

-- Function to get recent GPS51 trips
CREATE OR REPLACE FUNCTION get_gps51_trips(
  p_device_id text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  device_id text,
  start_time timestamptz,
  end_time timestamptz,
  start_latitude numeric,
  start_longitude numeric,
  end_latitude numeric,
  end_longitude numeric,
  distance_km numeric,
  avg_speed_kmh numeric,
  max_speed_kmh numeric,
  duration_seconds integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    device_id,
    start_time,
    end_time,
    start_latitude,
    start_longitude,
    end_latitude,
    end_longitude,
    distance_km,
    avg_speed_kmh,
    max_speed_kmh,
    duration_seconds
  FROM gps51_trips
  WHERE device_id = p_device_id
    AND start_time IS NOT NULL
  ORDER BY start_time DESC
  LIMIT p_limit;
$$;

-- Function to get recent GPS51 alarms
CREATE OR REPLACE FUNCTION get_gps51_alarms(
  p_device_id text,
  p_limit integer DEFAULT 50,
  p_unacknowledged_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  device_id text,
  alarm_code bigint,
  alarm_description text,
  alarm_description_en text,
  severity text,
  latitude numeric,
  longitude numeric,
  speed_kmh numeric,
  alarm_time timestamptz,
  acknowledged boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    id,
    device_id,
    alarm_code,
    alarm_description,
    alarm_description_en,
    severity,
    latitude,
    longitude,
    speed_kmh,
    alarm_time,
    acknowledged
  FROM gps51_alarms
  WHERE device_id = p_device_id
    AND (NOT p_unacknowledged_only OR acknowledged = false)
  ORDER BY alarm_time DESC
  LIMIT p_limit;
$$;

-- Function to acknowledge an alarm
CREATE OR REPLACE FUNCTION acknowledge_gps51_alarm(
  p_alarm_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE gps51_alarms
  SET
    acknowledged = true,
    acknowledged_at = now(),
    acknowledged_by = p_user_id
  WHERE id = p_alarm_id
    AND acknowledged = false;

  RETURN FOUND;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_gps51_trips(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_gps51_alarms(text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_gps51_alarm(uuid, uuid) TO authenticated;

-- =====================================================
-- 4. Sync Status Tracking
-- =====================================================

-- Table to track GPS51 sync status
CREATE TABLE IF NOT EXISTS gps51_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE REFERENCES vehicles(device_id) ON DELETE CASCADE,

  -- Trip sync status
  last_trip_sync_at timestamptz,
  last_trip_synced timestamptz, -- Last trip end_time synced
  trips_synced_count integer DEFAULT 0,
  trip_sync_error text,

  -- Alarm sync status
  last_alarm_sync_at timestamptz,
  last_alarm_synced timestamptz, -- Last alarm_time synced
  alarms_synced_count integer DEFAULT 0,
  alarm_sync_error text,

  -- Overall status
  sync_status text DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'completed', 'error')),

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_gps51_sync_status_device
  ON gps51_sync_status(device_id);
CREATE INDEX IF NOT EXISTS idx_gps51_sync_status_updated
  ON gps51_sync_status(updated_at DESC);

-- Enable RLS
ALTER TABLE gps51_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view alarms for assigned vehicles" ON gps51_alarms;
CREATE POLICY "Users can view alarms for assigned vehicles"
  ON gps51_alarms
  FOR SELECT
  TO authenticated
  USING (
    device_id IN (
      SELECT va.device_id 
      FROM vehicle_assignments va
      JOIN profiles p ON va.profile_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage alarms" ON gps51_alarms;
CREATE POLICY "Service role can manage alarms"
  ON gps51_alarms
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON gps51_sync_status TO authenticated;
GRANT ALL ON gps51_sync_status TO service_role;

-- Function to update sync timestamp
CREATE OR REPLACE FUNCTION update_gps51_sync_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER update_gps51_sync_status_timestamp
  BEFORE UPDATE ON gps51_sync_status
  FOR EACH ROW
  EXECUTE FUNCTION update_gps51_sync_timestamp();

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE gps51_trips IS 'Stores trip data directly from GPS51 querytrips API without transformations';
COMMENT ON TABLE gps51_alarms IS 'Stores alarm data extracted from GPS51 position responses';
COMMENT ON TABLE gps51_sync_status IS 'Tracks GPS51 data synchronization status for each device';
COMMENT ON COLUMN gps51_trips.distance_meters IS 'GPS51 calculated distance (more accurate than Haversine)';
COMMENT ON COLUMN gps51_trips.gps51_raw_data IS 'Complete GPS51 API response for debugging';
COMMENT ON COLUMN gps51_alarms.alarm_code IS 'GPS51 alarm field (JT808 protocol)';
COMMENT ON COLUMN gps51_alarms.severity IS 'Derived severity: info, warning, error, critical';
