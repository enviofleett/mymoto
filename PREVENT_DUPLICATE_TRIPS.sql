-- ============================================
-- PREVENT DUPLICATE TRIPS
-- Adds unique constraint to prevent duplicate trips at database level
-- ============================================

-- Step 1: Create a unique index on (device_id, start_time, end_time)
-- This will prevent exact duplicate trips from being inserted
-- Note: This uses exact timestamp matching (millisecond precision)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing 
ON vehicle_trips(device_id, start_time, end_time)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;

-- Step 2: Verify the index was created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'vehicle_trips'
  AND indexname = 'idx_vehicle_trips_unique_timing';

-- Step 3: Test that duplicates are prevented
-- This should fail with a unique constraint violation:
/*
INSERT INTO vehicle_trips (
  device_id, 
  start_time, 
  end_time, 
  start_latitude, 
  start_longitude, 
  end_latitude, 
  end_longitude,
  distance_km
) VALUES (
  '358657105966092',
  '2026-01-21 08:03:15+00',
  '2026-01-21 08:14:20+00',
  0, 0, 0, 0, 0
);
-- Should get: ERROR: duplicate key value violates unique constraint
*/

-- Alternative: If you want to allow near-duplicates (within same second) but prevent exact duplicates,
-- you can use a partial unique index that truncates to seconds:
/*
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_trips_unique_timing_second 
ON vehicle_trips(
  device_id, 
  date_trunc('second', start_time), 
  date_trunc('second', end_time)
)
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;
*/
