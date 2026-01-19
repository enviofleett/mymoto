-- Cleanup Invalid Timestamps - BATCH PROCESSING VERSION
-- Processes records in small batches to avoid timeouts
-- Run each batch separately and check results before proceeding

-- ============================================================================
-- STEP 1: Check how many records need cleanup (FAST CHECK)
-- ============================================================================
SELECT 
  'position_history_future' as table_type,
  COUNT(*) as records_to_cleanup
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '30 days'
LIMIT 1000;

SELECT 
  'vehicle_positions_future' as table_type,
  COUNT(*) as records_to_cleanup
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '30 days'
LIMIT 1000;

-- ============================================================================
-- STEP 2: OPTION A - Set invalid dates to NULL (RECOMMENDED - SAFEST)
-- ============================================================================
-- Run these ONE AT A TIME, checking results between each

-- Batch 1: position_history (first 100 records - REDUCED to prevent timeout)
WITH batch AS (
  SELECT id FROM position_history
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '7 days'  -- Reduced to 7 days
  ORDER BY recorded_at DESC
  LIMIT 100  -- Reduced from 1000 to 100
)
UPDATE position_history
SET gps_time = NULL
FROM batch
WHERE position_history.id = batch.id;

-- Check progress (FAST - uses LIMIT)
SELECT COUNT(*) as remaining_future_dates
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
LIMIT 1;

-- Batch 2: vehicle_positions (first 50 records - REDUCED)
WITH batch AS (
  SELECT id FROM vehicle_positions
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND cached_at >= NOW() - INTERVAL '7 days'  -- Reduced to 7 days
  ORDER BY cached_at DESC
  LIMIT 50  -- Reduced from 100 to 50
)
UPDATE vehicle_positions
SET gps_time = NULL
FROM batch
WHERE vehicle_positions.id = batch.id;

-- Check progress (FAST - uses LIMIT)
SELECT COUNT(*) as remaining_future_dates
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days'
LIMIT 1;

-- ============================================================================
-- STEP 3: OPTION B - Delete invalid records (MORE AGGRESSIVE)
-- ============================================================================
-- Only use if you're sure you want to delete these records
-- Run ONE AT A TIME

-- Batch 1: position_history (first 1000 records)
-- DELETE FROM position_history
-- WHERE id IN (
--   SELECT id FROM position_history
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND recorded_at >= NOW() - INTERVAL '30 days'
--   LIMIT 1000
-- );

-- Batch 2: vehicle_positions (first 100 records)
-- DELETE FROM vehicle_positions
-- WHERE id IN (
--   SELECT id FROM vehicle_positions
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND cached_at >= NOW() - INTERVAL '30 days'
--   LIMIT 100
-- );

-- ============================================================================
-- STEP 4: OPTION C - Update to current time (PRESERVES RECORDS)
-- ============================================================================
-- Run ONE AT A TIME

-- Batch 1: position_history (first 1000 records)
-- UPDATE position_history
-- SET gps_time = NOW()
-- WHERE id IN (
--   SELECT id FROM position_history
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND recorded_at >= NOW() - INTERVAL '30 days'
--   LIMIT 1000
-- );

-- Batch 2: vehicle_positions (first 100 records)
-- UPDATE vehicle_positions
-- SET gps_time = NOW()
-- WHERE id IN (
--   SELECT id FROM vehicle_positions
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND cached_at >= NOW() - INTERVAL '30 days'
--   LIMIT 100
-- );

-- ============================================================================
-- VERIFICATION: Check cleanup results
-- ============================================================================
SELECT 
  'position_history' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as remaining_future,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as remaining_past
FROM position_history
WHERE recorded_at >= NOW() - INTERVAL '30 days'
LIMIT 10000;

SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) FILTER (WHERE gps_time > NOW() + INTERVAL '1 day') as remaining_future,
  COUNT(*) FILTER (WHERE gps_time < '2020-01-01'::timestamp) as remaining_past
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '30 days'
LIMIT 1000;
