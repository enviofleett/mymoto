-- Reset and re-sync trips for device 358657105967694 today
-- Run this in Supabase SQL Editor BEFORE running the sync function

-- Step 1: Delete existing trips for today (so we can re-detect them)
DELETE FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now())
  AND start_time < now();

-- Step 2: Reset sync status to force full re-sync
DELETE FROM trip_sync_status
WHERE device_id = '358657105967694';

-- Step 3: Verify deletion
SELECT 
  'Trips remaining' AS check_type,
  COUNT(*) AS count
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now())
UNION ALL
SELECT 
  'Sync status records' AS check_type,
  COUNT(*) AS count
FROM trip_sync_status
WHERE device_id = '358657105967694';

-- After running this, call the sync function with force_full_sync=true
