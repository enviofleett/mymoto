-- Unify Overspeeding Detection
-- Consolidates overspeeding detection logic across all triggers and functions
-- Uses consistent threshold (100 km/h) and severity levels

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
