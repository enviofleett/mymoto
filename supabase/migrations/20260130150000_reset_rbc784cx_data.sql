-- Migration: Reset RBC784CX Data
-- Description:
-- Deletes all vehicle_trips and sync status for device 'RBC784CX' to force a fresh, clean sync.
-- This fixes the issue where old "ghost" trips (calculated before the fix) were mixing with real GPS51 trips.

DO $$
DECLARE
  v_device_id TEXT;
BEGIN
  -- 1. Find the device_id for RBC784CX
  -- (It might be the name or the ID, checking both)
  SELECT device_id INTO v_device_id
  FROM vehicles
  WHERE device_name = 'RBC784CX' OR device_id = 'RBC784CX'
  LIMIT 1;

  IF v_device_id IS NOT NULL THEN
    RAISE NOTICE 'Cleaning up data for device: %', v_device_id;

    -- 2. Delete ALL trips for this device
    -- This removes both "gps51" (if any exist) and any old "calculated" trips
    DELETE FROM vehicle_trips
    WHERE device_id = v_device_id;

    -- 3. Reset sync status
    -- This forces the next sync to run as a "first run" (last 24 hours)
    DELETE FROM trip_sync_status
    WHERE device_id = v_device_id;

    RAISE NOTICE 'Cleanup complete for %', v_device_id;
  ELSE
    RAISE NOTICE 'Device RBC784CX not found, skipping cleanup';
  END IF;
END;
$$;
