# Code Prompt: Deploy Notification System Database Migrations

## Objective
Deploy database migrations to fix notification system issues:
1. Add `vehicle_moving` event type to the database
2. Unify overspeeding detection logic across all triggers and functions

## Context
The notification system audit identified that:
- `vehicle_moving` event type is missing from the database enum
- Overspeeding detection has inconsistent logic across multiple functions
- These issues prevent proper notification triggering in the PWA

## Tasks

### Task 1: Deploy vehicle_moving Event Type Migration

**File:** `supabase/migrations/20260122000003_add_vehicle_moving_event.sql`

**Action:** 
1. Verify the migration file exists at the path above
2. Review the migration to ensure it:
   - Adds `vehicle_moving` to the `event_type` enum safely (using DO block to check if exists)
   - Updates `detect_vehicle_events()` function to detect vehicle movement (speed transitions from ≤5 to >5 km/h)
   - Includes proper cooldown logic (10 minutes) to prevent spam
3. Deploy the migration to the Supabase database using one of these methods:
   - **Option A (Supabase CLI):** Run `supabase db push` or `supabase migration up`
   - **Option B (Supabase Dashboard):** Copy the SQL content and run it in the SQL Editor
   - **Option C (CI/CD):** If migrations are automated, ensure this file is included in the deployment pipeline

**Verification Steps:**
```sql
-- Verify enum value was added
SELECT unnest(enum_range(NULL::event_type)) AS event_type;

-- Should include 'vehicle_moving' in the list

-- Verify function was updated
SELECT prosrc FROM pg_proc WHERE proname = 'detect_vehicle_events';

-- Should show the updated function with vehicle_moving detection logic
```

**Expected Outcome:**
- `vehicle_moving` appears in the `event_type` enum
- `detect_vehicle_events()` function includes vehicle movement detection
- Events are created when vehicle speed transitions from ≤5 to >5 km/h

---

### Task 2: Create and Deploy Overspeeding Unification Migration

**File:** `supabase/migrations/20260122000004_unify_overspeeding_detection.sql`

**Action:**
1. Create a new migration file with the following SQL:

```sql
-- Unify Overspeeding Detection
-- Consolidates overspeeding detection logic across all triggers and functions
-- Uses consistent threshold (100 km/h) and severity levels

-- Step 1: Create unified overspeeding detection function
CREATE OR REPLACE FUNCTION detect_overspeeding_unified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  speed_threshold DECIMAL := 100; -- km/h (configurable)
  last_event_time TIMESTAMPTZ;
  event_severity event_severity;
BEGIN
  -- Only trigger if is_overspeeding flag is true AND speed exceeds threshold
  -- Also validate speed is reasonable (0-300 km/h)
  IF NEW.is_overspeeding = true 
     AND NEW.speed IS NOT NULL 
     AND NEW.speed > speed_threshold
     AND NEW.speed > 0 
     AND NEW.speed < 300 THEN -- Sanity check
    
    -- Determine severity based on speed
    event_severity := CASE 
      WHEN NEW.speed > 120 THEN 'critical'::event_severity
      WHEN NEW.speed > 100 THEN 'error'::event_severity
      ELSE 'warning'::event_severity
    END;
    
    -- Check cooldown (5 minutes) to prevent duplicate events
    SELECT MAX(created_at) INTO last_event_time
    FROM proactive_vehicle_events
    WHERE device_id = NEW.device_id
      AND event_type = 'overspeeding'
      AND created_at > NOW() - INTERVAL '5 minutes';
    
    -- Only create event if no recent event exists
    IF last_event_time IS NULL THEN
      PERFORM create_proactive_event(
        p_device_id := NEW.device_id,
        p_event_type := 'overspeeding'::event_type,
        p_severity := event_severity,
        p_title := CASE 
          WHEN NEW.speed > 120 THEN 'Critical: Excessive Speed'
          WHEN NEW.speed > 100 THEN 'Overspeeding Detected'
          ELSE 'Speed Warning'
        END,
        p_description := format('Vehicle traveling at %s km/h (limit: %s km/h)', 
          ROUND(NEW.speed::numeric, 0), speed_threshold),
        p_metadata := jsonb_build_object(
          'speed', NEW.speed,
          'threshold', speed_threshold,
          'severity', event_severity::text
        ),
        p_latitude := NEW.latitude,
        p_longitude := NEW.longitude,
        p_value_after := NEW.speed,
        p_threshold := speed_threshold
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 2: Replace existing overspeeding trigger on vehicle_positions
-- Drop old trigger if it exists
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

-- Step 5: Update gps-data edge function logic (documentation only)
-- The edge function at supabase/functions/gps-data/index.ts should be updated to:
-- - Remove overspeeding detection (let database triggers handle it)
-- - Keep only ignition and vehicle_moving detection
-- This is a code change, not a migration, but should be done together

-- Comments
COMMENT ON FUNCTION detect_overspeeding_unified IS 'Unified overspeeding detection with consistent thresholds and severity levels';
COMMENT ON FUNCTION detect_critical_events IS 'Detects critical battery events only. Overspeeding handled separately.';
```

2. Save the migration file
3. Deploy using the same method as Task 1

**Verification Steps:**
```sql
-- Verify unified function exists
SELECT proname, prosrc FROM pg_proc WHERE proname = 'detect_overspeeding_unified';

-- Verify trigger is created
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trigger_detect_overspeeding_unified';

-- Verify old overspeeding logic is removed from detect_critical_events
SELECT prosrc FROM pg_proc WHERE proname = 'detect_critical_events';
-- Should NOT contain overspeeding detection logic

-- Test overspeeding detection (if you have test data)
-- Update a vehicle_positions record to set is_overspeeding = true and speed > 100
-- Should create a proactive_vehicle_events record
```

**Expected Outcome:**
- Single unified overspeeding detection function
- Consistent severity levels (critical >120, error >100, warning otherwise)
- No duplicate overspeeding events
- Battery detection separated from overspeeding detection

---

### Task 3: Update gps-data Edge Function (Optional but Recommended)

**File:** `supabase/functions/gps-data/index.ts`

**Action:**
1. Review the overspeeding detection in the edge function (around line 280)
2. Consider removing overspeeding detection from the edge function since database triggers now handle it
3. Keep only:
   - Battery detection (as backup/early warning)
   - Ignition on/off detection
   - Vehicle moving detection
4. This prevents duplicate events and ensures consistency

**Note:** This is a code change, not a migration. Deploy separately after migrations.

---

## Deployment Checklist

- [ ] Review migration file `20260122000003_add_vehicle_moving_event.sql`
- [ ] Deploy vehicle_moving migration
- [ ] Verify vehicle_moving enum value exists
- [ ] Verify detect_vehicle_events() function updated
- [ ] Create migration file `20260122000004_unify_overspeeding_detection.sql`
- [ ] Deploy overspeeding unification migration
- [ ] Verify detect_overspeeding_unified() function exists
- [ ] Verify trigger is created
- [ ] Verify old overspeeding logic removed from detect_critical_events()
- [ ] Test overspeeding detection with test data
- [ ] (Optional) Update gps-data edge function to remove duplicate overspeeding detection

## Rollback Plan

If issues occur, rollback using:

```sql
-- Rollback vehicle_moving (if needed)
-- Note: Cannot remove enum values easily, but can disable detection
ALTER FUNCTION detect_vehicle_events() RENAME TO detect_vehicle_events_old;
-- Restore previous version from backup

-- Rollback overspeeding unification
DROP TRIGGER IF EXISTS trigger_detect_overspeeding_unified ON vehicle_positions;
DROP FUNCTION IF EXISTS detect_overspeeding_unified();
-- Restore previous detect_critical_events() from backup
```

## Success Criteria

✅ `vehicle_moving` events are created when vehicle speed transitions from ≤5 to >5 km/h  
✅ Overspeeding events use consistent thresholds and severity levels  
✅ No duplicate overspeeding events within 5-minute cooldown  
✅ Battery and overspeeding detection are properly separated  
✅ All notifications trigger correctly in PWA

## Testing

After deployment, test:
1. Vehicle starts moving → `vehicle_moving` event created
2. Vehicle exceeds 100 km/h → `overspeeding` event with appropriate severity
3. Vehicle exceeds 120 km/h → `overspeeding` event with 'critical' severity
4. Multiple speed updates → Only one event per 5-minute window
5. Notifications appear in PWA for all event types

---

**Generated:** January 22, 2025  
**Related Files:**
- `supabase/migrations/20260122000003_add_vehicle_moving_event.sql`
- `supabase/migrations/20260122000004_unify_overspeeding_detection.sql` (to be created)
- `NOTIFICATION_SYSTEM_AUDIT_REPORT.md`
