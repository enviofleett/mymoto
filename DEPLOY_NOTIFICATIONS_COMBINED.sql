-- ============================================================================
-- NOTIFICATION SYSTEM MIGRATIONS - COMBINED SQL
-- ============================================================================
-- Copy and paste this entire file into Supabase SQL Editor
-- Run in order: Migration 1, then Migration 2
-- Date: January 22, 2025
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Add vehicle_moving Event Type
-- ============================================================================
-- File: 20260122000003_add_vehicle_moving_event.sql
-- ============================================================================

-- Add vehicle_moving event type to enum
-- This migration is self-contained: it creates the enum if it doesn't exist,
-- then adds the vehicle_moving value

DO $$ 
DECLARE
  enum_exists BOOLEAN;
  value_exists BOOLEAN;
BEGIN
  -- Check if event_type enum exists (in public schema)
  SELECT EXISTS (
    SELECT 1 
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'event_type'
    AND n.nspname = 'public'
  ) INTO enum_exists;
  
  -- Create enum if it doesn't exist (with all standard values)
  IF NOT enum_exists THEN
    CREATE TYPE public.event_type AS ENUM (
      'low_battery',
      'critical_battery',
      'overspeeding',
      'harsh_braking',
      'rapid_acceleration',
      'ignition_on',
      'ignition_off',
      'geofence_enter',
      'geofence_exit',
      'idle_too_long',
      'offline',
      'online',
      'maintenance_due',
      'trip_completed',
      'anomaly_detected',
      'vehicle_moving'  -- Include vehicle_moving in initial creation
    );
    RAISE NOTICE 'Created event_type enum with vehicle_moving included';
  ELSE
    -- Enum exists, check if vehicle_moving value already exists
    SELECT EXISTS (
      SELECT 1 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'event_type'
      AND n.nspname = 'public'
      AND e.enumlabel = 'vehicle_moving'
    ) INTO value_exists;
    
    -- Add value if it doesn't exist
    IF NOT value_exists THEN
      ALTER TYPE public.event_type ADD VALUE 'vehicle_moving';
      RAISE NOTICE 'Added vehicle_moving to existing event_type enum';
    ELSE
      RAISE NOTICE 'vehicle_moving already exists in event_type enum';
    END IF;
  END IF;
END $$;

-- Update detect_vehicle_events() to detect vehicle movement start
CREATE OR REPLACE FUNCTION detect_vehicle_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prev_position RECORD;
  speed_threshold DECIMAL := 100; -- km/h
  battery_low_threshold DECIMAL := 20; -- %
  battery_critical_threshold DECIMAL := 10; -- %
  idle_threshold_minutes INTEGER := 30; -- minutes
  movement_speed_threshold DECIMAL := 5; -- km/h - minimum speed to consider "moving"
BEGIN
  -- Get previous position for comparison
  SELECT * INTO prev_position
  FROM position_history
  WHERE device_id = NEW.device_id
    AND id != NEW.id
  ORDER BY gps_time DESC
  LIMIT 1;

  -- Skip if no previous position (first record)
  IF prev_position IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. LOW BATTERY EVENT
  IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent < battery_low_threshold
     AND (prev_position.battery_percent IS NULL OR prev_position.battery_percent >= battery_low_threshold) THEN

    IF NEW.battery_percent < battery_critical_threshold THEN
      -- Critical battery
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'critical_battery'::event_type,
        p_severity := 'critical'::event_severity,
        p_title := 'Critical Battery Level',
        p_description := format('Battery dropped to %s%%. Immediate attention required.', NEW.battery_percent),
        p_metadata := jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'previous_percent', prev_position.battery_percent
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_before := prev_position.battery_percent,
        p_value_after := NEW.battery_percent,
        p_threshold := battery_critical_threshold
      );
    ELSE
      -- Low battery
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'low_battery'::event_type,
        p_severity := 'warning'::event_severity,
        p_title := 'Low Battery Warning',
        p_description := format('Battery at %s%%. Consider charging soon.', NEW.battery_percent),
        p_metadata := jsonb_build_object(
          'battery_percent', NEW.battery_percent,
          'previous_percent', prev_position.battery_percent
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_before := prev_position.battery_percent,
        p_value_after := NEW.battery_percent,
        p_threshold := battery_low_threshold
      );
    END IF;
  END IF;

  -- 2. OVERSPEEDING EVENT
  IF NEW.speed IS NOT NULL AND NEW.speed > speed_threshold
     AND (prev_position.speed IS NULL OR prev_position.speed <= speed_threshold) THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'overspeeding'::event_type,
      p_severity := 'error'::event_severity,
      p_title := 'Overspeeding Detected',
      p_description := format('Vehicle speed reached %s km/h (limit: %s km/h)', NEW.speed, speed_threshold),
      p_metadata := jsonb_build_object(
        'speed', NEW.speed,
        'threshold', speed_threshold,
        'previous_speed', prev_position.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed,
      p_threshold := speed_threshold
    );
  END IF;

  -- 3. RAPID ACCELERATION EVENT
  -- Detect if speed increased by more than 30 km/h in one update
  IF NEW.speed IS NOT NULL AND prev_position.speed IS NOT NULL
     AND (NEW.speed - prev_position.speed) > 30 THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'rapid_acceleration'::event_type,
      p_severity := 'warning'::event_severity,
      p_title := 'Rapid Acceleration',
      p_description := format('Speed increased rapidly from %s to %s km/h', prev_position.speed, NEW.speed),
      p_metadata := jsonb_build_object(
        'speed_before', prev_position.speed,
        'speed_after', NEW.speed,
        'delta', NEW.speed - prev_position.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed
    );
  END IF;

  -- 4. HARSH BRAKING EVENT
  -- Detect if speed decreased by more than 40 km/h in one update
  IF NEW.speed IS NOT NULL AND prev_position.speed IS NOT NULL
     AND (prev_position.speed - NEW.speed) > 40 THEN

    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'harsh_braking'::event_type,
      p_severity := 'warning'::event_severity,
      p_title := 'Harsh Braking Detected',
      p_description := format('Speed dropped rapidly from %s to %s km/h', prev_position.speed, NEW.speed),
      p_metadata := jsonb_build_object(
        'speed_before', prev_position.speed,
        'speed_after', NEW.speed,
        'delta', prev_position.speed - NEW.speed
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_value_before := prev_position.speed,
      p_value_after := NEW.speed
    );
  END IF;

  -- 5. IGNITION ON EVENT
  IF NEW.ignition_on = true AND prev_position.ignition_on = false THEN
    PERFORM create_proactive_event(
      p_device_id := NEW.device_id,
      p_event_type := 'ignition_on'::event_type,
      p_severity := 'info'::event_severity,
      p_title := 'Vehicle Started',
      p_description := 'Ignition turned on, vehicle is now active',
      p_metadata := jsonb_build_object(
        'battery_percent', NEW.battery_percent,
        'location_lat', NEW.latitude,
        'location_lon', NEW.longitude
      ),
      p_latitude := NEW.latitude,
      p_longitude := NEW.longitude,
      p_expires_hours := 2  -- Short expiry for info events
    );
  END IF;

  -- 6. VEHICLE MOVING EVENT (NEW)
  -- Detect when vehicle starts moving (speed transitions from <=5 to >5 km/h)
  -- This is separate from ignition_on - vehicle may be started but not moving yet
  IF NEW.ignition_on = true 
     AND NEW.speed IS NOT NULL AND NEW.speed > movement_speed_threshold
     AND (prev_position.speed IS NULL OR prev_position.speed <= movement_speed_threshold) THEN
    
    -- Check cooldown (don't spam if vehicle stops and starts multiple times)
    DECLARE
      last_moving_event TIMESTAMPTZ;
    BEGIN
      SELECT MAX(created_at) INTO last_moving_event
      FROM proactive_vehicle_events
      WHERE device_id = NEW.device_id
        AND event_type = 'vehicle_moving'
        AND created_at > NOW() - INTERVAL '10 minutes';
      
      IF last_moving_event IS NULL THEN
        PERFORM create_proactive_event(
          p_device_id := NEW.device_id,
          p_event_type := 'vehicle_moving'::event_type,
          p_severity := 'info'::event_severity,
          p_title := 'Vehicle Started Moving',
          p_description := format('Vehicle is now moving at %s km/h', ROUND(NEW.speed::numeric, 0)),
          p_metadata := jsonb_build_object(
            'speed', NEW.speed,
            'previous_speed', prev_position.speed,
            'ignition_on', NEW.ignition_on
          ),
          p_latitude := NEW.latitude,
          p_longitude := NEW.longitude,
          p_value_before := prev_position.speed,
          p_value_after := NEW.speed,
          p_expires_hours := 1
        );
      END IF;
    END;
  END IF;

  -- 7. IGNITION OFF EVENT (Trip completed)
  IF NEW.ignition_on = false AND prev_position.ignition_on = true THEN
    -- Calculate trip summary
    DECLARE
      trip_duration INTERVAL;
      trip_distance DECIMAL;
    BEGIN
      -- Get the ignition-on position for this trip
      SELECT
        EXTRACT(EPOCH FROM (NEW.gps_time - ph_start.gps_time)) AS duration_seconds,
        -- Simple distance estimate (would need Haversine for accuracy)
        (NEW.total_mileage - ph_start.total_mileage) AS distance_meters
      INTO trip_duration, trip_distance
      FROM position_history ph_start
      WHERE ph_start.device_id = NEW.device_id
        AND ph_start.ignition_on = true
        AND ph_start.gps_time < NEW.gps_time
      ORDER BY ph_start.gps_time DESC
      LIMIT 1;

      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'ignition_off'::event_type,
        p_severity := 'info'::event_severity,
        p_title := 'Engine Stopped',
        p_description := format('Vehicle engine has been turned off%s', 
          CASE WHEN trip_duration IS NOT NULL 
            THEN format(' after %s minutes', EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60)
            ELSE ''
          END),
        p_metadata := jsonb_build_object(
          'duration_minutes', CASE WHEN trip_duration IS NOT NULL 
            THEN EXTRACT(EPOCH FROM trip_duration)::INTEGER / 60 
            ELSE NULL END,
          'distance_km', COALESCE(trip_distance / 1000.0, 0),
          'final_battery', NEW.battery_percent,
          'location_lat', NEW.latitude,
          'location_lon', NEW.longitude
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_expires_hours := 2
      );
    END;
  END IF;

  -- 8. IDLE TOO LONG EVENT
  -- Check if ignition is on but vehicle hasn't moved significantly
  IF NEW.ignition_on = true AND prev_position.ignition_on = true
     AND NEW.speed IS NOT NULL AND NEW.speed < 5  -- Nearly stationary
     AND prev_position.speed IS NOT NULL AND prev_position.speed < 5 THEN

    -- Check how long vehicle has been idle
    DECLARE
      idle_duration INTERVAL;
      idle_minutes INTEGER;
    BEGIN
      SELECT
        NEW.gps_time - MIN(ph.gps_time)
      INTO idle_duration
      FROM position_history ph
      WHERE ph.device_id = NEW.device_id
        AND ph.ignition_on = true
        AND ph.speed < 5
        AND ph.gps_time <= NEW.gps_time
        AND ph.gps_time > NEW.gps_time - INTERVAL '2 hours';  -- Look back max 2 hours

      idle_minutes := EXTRACT(EPOCH FROM idle_duration)::INTEGER / 60;

      -- Only create event if idling for more than threshold
      IF idle_minutes >= idle_threshold_minutes THEN
        PERFORM create_proactive_event(
          p_device_id := NEW.device_id,
          p_event_type := 'idle_too_long'::event_type,
          p_severity := 'warning'::event_severity,
          p_title := 'Extended Idle Time',
          p_description := format('Vehicle has been idling for %s minutes', idle_minutes),
          p_metadata := jsonb_build_object(
            'idle_minutes', idle_minutes,
            'battery_percent', NEW.battery_percent,
            'threshold_minutes', idle_threshold_minutes
          ),
          p_latitude := NEW.latitude,
          p_longitude := NEW.longitude,
          p_threshold := idle_threshold_minutes
        );
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- MIGRATION 2: Unify Overspeeding Detection
-- ============================================================================
-- File: 20260122000004_unify_overspeeding_detection.sql
-- ============================================================================

-- Ensure event_severity enum exists
DO $$ 
DECLARE
  enum_exists BOOLEAN;
BEGIN
  -- Check if event_severity enum exists (in public schema)
  SELECT EXISTS (
    SELECT 1 
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'event_severity'
    AND n.nspname = 'public'
  ) INTO enum_exists;
  
  -- Create enum if it doesn't exist
  IF NOT enum_exists THEN
    CREATE TYPE public.event_severity AS ENUM (
      'info',
      'warning',
      'error',
      'critical'
    );
    RAISE NOTICE 'Created event_severity enum';
  END IF;
END $$;

-- Step 1: Create unified overspeeding detection function
-- Note: This function works with both TEXT and enum severity types
CREATE OR REPLACE FUNCTION detect_overspeeding_unified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  speed_threshold DECIMAL := 100; -- km/h (configurable)
  last_event_time TIMESTAMPTZ;
  event_severity TEXT; -- Use TEXT to work with both enum and TEXT columns
  event_title TEXT;
  use_function BOOLEAN := false; -- Check if create_proactive_event function exists
BEGIN
  -- Only trigger if is_overspeeding flag is true AND speed exceeds threshold
  -- Also validate speed is reasonable (0-300 km/h)
  IF NEW.is_overspeeding = true 
     AND NEW.speed IS NOT NULL 
     AND NEW.speed > speed_threshold
     AND NEW.speed > 0 
     AND NEW.speed < 300 THEN -- Sanity check
    
    -- Determine severity based on speed (as TEXT)
    event_severity := CASE 
      WHEN NEW.speed > 120 THEN 'critical'
      WHEN NEW.speed > 100 THEN 'error'
      ELSE 'warning'
    END;
    
    -- Determine title
    event_title := CASE 
      WHEN NEW.speed > 120 THEN 'Critical: Excessive Speed'
      WHEN NEW.speed > 100 THEN 'Overspeeding Detected'
      ELSE 'Speed Warning'
    END;
    
    -- Check cooldown (5 minutes) to prevent duplicate events
    SELECT MAX(created_at) INTO last_event_time
    FROM proactive_vehicle_events
    WHERE device_id = NEW.device_id
      AND event_type = 'overspeeding'
      AND created_at > NOW() - INTERVAL '5 minutes';
    
    -- Only create event if no recent event exists
    IF last_event_time IS NULL THEN
      -- Check if create_proactive_event function exists
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'create_proactive_event'
      ) INTO use_function;
      
      IF use_function THEN
        -- Use create_proactive_event function if it exists
        PERFORM create_proactive_event(
          p_device_id := NEW.device_id,
          p_event_type := 'overspeeding',
          p_severity := event_severity,
          p_title := event_title,
          p_description := format('Vehicle traveling at %s km/h (limit: %s km/h)', 
            ROUND(NEW.speed::numeric, 0), speed_threshold),
          p_metadata := jsonb_build_object(
            'speed', NEW.speed,
            'threshold', speed_threshold,
            'severity', event_severity
          ),
          p_latitude := NEW.latitude,
          p_longitude := NEW.longitude,
          p_value_after := NEW.speed,
          p_threshold := speed_threshold
        );
      ELSE
        -- Direct INSERT if function doesn't exist
        INSERT INTO proactive_vehicle_events (
          device_id, event_type, severity, title, message, metadata
        ) VALUES (
          NEW.device_id,
          'overspeeding',
          event_severity,
          event_title,
          format('Vehicle traveling at %s km/h (limit: %s km/h)', 
            ROUND(NEW.speed::numeric, 0), speed_threshold),
          jsonb_build_object(
            'speed', NEW.speed,
            'threshold', speed_threshold,
            'severity', event_severity
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 2: Replace existing overspeeding trigger on vehicle_positions
-- Drop old triggers if they exist
DROP TRIGGER IF EXISTS trigger_detect_critical_events ON vehicle_positions;
DROP TRIGGER IF EXISTS trigger_detect_overspeeding_unified ON vehicle_positions;

-- Create new unified trigger
-- Only fires when is_overspeeding changes from false to true
CREATE TRIGGER trigger_detect_overspeeding_unified
BEFORE UPDATE ON vehicle_positions
FOR EACH ROW
WHEN (NEW.is_overspeeding = true AND (OLD.is_overspeeding IS NULL OR OLD.is_overspeeding = false))
EXECUTE FUNCTION detect_overspeeding_unified();

-- Step 3: Update detect_critical_events() to remove duplicate overspeeding logic
-- This function should only handle battery detection now
CREATE OR REPLACE FUNCTION public.detect_critical_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    event_key TEXT;
    last_event_time TIMESTAMPTZ;
    cooldown_minutes INTEGER := 5; -- Prevent duplicate events within 5 minutes
BEGIN
    -- LOW BATTERY DETECTION (only on state change or first detection)
    IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent > 0 AND NEW.battery_percent < 20 THEN
        -- Check if we already have a recent low battery event
        event_key := CASE WHEN NEW.battery_percent < 10 THEN 'critical_battery' ELSE 'low_battery' END;
        
        SELECT MAX(created_at) INTO last_event_time
        FROM proactive_vehicle_events
        WHERE device_id = NEW.device_id
          AND event_type = event_key
          AND created_at > NOW() - INTERVAL '5 minutes';
        
        -- Only create if no recent event exists
        IF last_event_time IS NULL THEN
            -- Also check for state change (was >= 20, now < 20)
            IF OLD.battery_percent IS NULL OR OLD.battery_percent >= 20 OR NEW.battery_percent < OLD.battery_percent THEN
                INSERT INTO proactive_vehicle_events (
                    device_id, event_type, severity, title, message, metadata
                ) VALUES (
                    NEW.device_id,
                    event_key,
                    CASE WHEN NEW.battery_percent < 10 THEN 'critical' ELSE 'warning' END,
                    CASE WHEN NEW.battery_percent < 10 THEN 'Critical Battery Alert' ELSE 'Low Battery Alert' END,
                    'Battery at ' || NEW.battery_percent || '%',
                    jsonb_build_object('battery_percent', NEW.battery_percent, 'previous_percent', OLD.battery_percent)
                );
            END IF;
        END IF;
    END IF;

    -- NOTE: Overspeeding detection is now handled by detect_overspeeding_unified()
    -- This function only handles battery events to avoid duplication

    -- Store previous battery for next comparison
    NEW.previous_battery_percent := OLD.battery_percent;
    
    RETURN NEW;
END;
$$;

-- Step 4: Update detect_critical_events_insert() to remove overspeeding logic
CREATE OR REPLACE FUNCTION public.detect_critical_events_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- LOW BATTERY on initial insert
    IF NEW.battery_percent IS NOT NULL AND NEW.battery_percent > 0 AND NEW.battery_percent < 20 THEN
        INSERT INTO proactive_vehicle_events (
            device_id, event_type, severity, title, message, metadata
        ) VALUES (
            NEW.device_id,
            CASE WHEN NEW.battery_percent < 10 THEN 'critical_battery' ELSE 'low_battery' END,
            CASE WHEN NEW.battery_percent < 10 THEN 'critical' ELSE 'warning' END,
            CASE WHEN NEW.battery_percent < 10 THEN 'Critical Battery Alert' ELSE 'Low Battery Alert' END,
            'Battery at ' || NEW.battery_percent || '%',
            jsonb_build_object('battery_percent', NEW.battery_percent)
        );
    END IF;

    -- NOTE: Overspeeding detection on insert is handled by detect_overspeeding_unified()
    -- when the vehicle_positions record is updated

    RETURN NEW;
END;
$$;

-- Step 5: Recreate the battery detection trigger (if it was dropped)
-- This ensures battery detection still works
DROP TRIGGER IF EXISTS trigger_detect_critical_events_battery ON vehicle_positions;
CREATE TRIGGER trigger_detect_critical_events_battery
BEFORE UPDATE ON vehicle_positions
FOR EACH ROW
WHEN (
  (OLD.battery_percent IS NULL OR OLD.battery_percent >= 20) 
  AND NEW.battery_percent IS NOT NULL 
  AND NEW.battery_percent < 20
)
EXECUTE FUNCTION detect_critical_events();

-- Also recreate insert trigger for battery
DROP TRIGGER IF EXISTS trigger_detect_critical_events_insert ON vehicle_positions;
CREATE TRIGGER trigger_detect_critical_events_insert
AFTER INSERT ON vehicle_positions
FOR EACH ROW
EXECUTE FUNCTION detect_critical_events_insert();

-- Comments
COMMENT ON FUNCTION detect_overspeeding_unified IS 'Unified overspeeding detection with consistent thresholds and severity levels. Handles all overspeeding events from vehicle_positions updates.';
COMMENT ON FUNCTION detect_critical_events IS 'Detects critical battery events only. Overspeeding is handled separately by detect_overspeeding_unified().';
COMMENT ON FUNCTION detect_critical_events_insert IS 'Detects critical battery events on initial vehicle position insert. Overspeeding handled separately.';

-- ============================================================================
-- VERIFICATION QUERIES (Run these after deployment to verify success)
-- ============================================================================

-- Check if vehicle_moving exists in enum
-- SELECT unnest(enum_range(NULL::event_type)) AS event_type;

-- Check if detect_overspeeding_unified function exists
-- SELECT proname FROM pg_proc WHERE proname = 'detect_overspeeding_unified';

-- Check if triggers are created
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE '%overspeeding%' OR tgname LIKE '%vehicle%';

-- ============================================================================
-- END OF MIGRATIONS
-- ============================================================================
