-- Cleanup Invalid Timestamps - ULTRA FAST VERSION
-- Processes records in VERY small batches (100 at a time)
-- Uses direct updates with CTEs to avoid subquery timeouts

-- ============================================================================
-- STEP 1: Quick check - How many records? (FAST - uses LIMIT)
-- ============================================================================
SELECT 
  'position_history_future' as table_type,
  (SELECT COUNT(*) FROM position_history
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND recorded_at >= NOW() - INTERVAL '7 days'  -- Only last 7 days
   LIMIT 1000) as estimated_count;

SELECT 
  'vehicle_positions_future' as table_type,
  (SELECT COUNT(*) FROM vehicle_positions
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND cached_at >= NOW() - INTERVAL '7 days'  -- Only last 7 days
   LIMIT 1000) as estimated_count;

-- ============================================================================
-- STEP 2: OPTION A - Set invalid dates to NULL (RECOMMENDED)
-- ============================================================================
-- Run these ONE AT A TIME, checking results between each
-- Each batch processes only 100 records

-- BATCH 1: position_history (first 100 records)
WITH batch AS (
  SELECT id FROM position_history
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND recorded_at >= NOW() - INTERVAL '7 days'
  ORDER BY recorded_at DESC  -- Process newest first
  LIMIT 100
)
UPDATE position_history
SET gps_time = NULL
FROM batch
WHERE position_history.id = batch.id;

-- Check if more remain (run this after each batch)
SELECT COUNT(*) as remaining
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
LIMIT 1;

-- BATCH 2: Repeat if needed (copy BATCH 1 and run again)
-- BATCH 3: Repeat if needed
-- ... continue until remaining = 0

-- BATCH 1: vehicle_positions (first 50 records - smaller table)
WITH batch AS (
  SELECT id FROM vehicle_positions
  WHERE gps_time > NOW() + INTERVAL '1 day'
    AND cached_at >= NOW() - INTERVAL '7 days'
  ORDER BY cached_at DESC
  LIMIT 50
)
UPDATE vehicle_positions
SET gps_time = NULL
FROM batch
WHERE vehicle_positions.id = batch.id;

-- Check if more remain
SELECT COUNT(*) as remaining
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days'
LIMIT 1;

-- ============================================================================
-- STEP 3: OPTION B - Delete invalid records (MORE AGGRESSIVE)
-- ============================================================================
-- Only use if you're sure - uncomment to use

-- BATCH 1: position_history (first 100 records)
-- WITH batch AS (
--   SELECT id FROM position_history
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND recorded_at >= NOW() - INTERVAL '7 days'
--   ORDER BY recorded_at DESC
--   LIMIT 100
-- )
-- DELETE FROM position_history
-- USING batch
-- WHERE position_history.id = batch.id;

-- BATCH 1: vehicle_positions (first 50 records)
-- WITH batch AS (
--   SELECT id FROM vehicle_positions
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND cached_at >= NOW() - INTERVAL '7 days'
--   ORDER BY cached_at DESC
--   LIMIT 50
-- )
-- DELETE FROM vehicle_positions
-- USING batch
-- WHERE vehicle_positions.id = batch.id;

-- ============================================================================
-- STEP 4: OPTION C - Update to current time
-- ============================================================================
-- Uncomment to use

-- BATCH 1: position_history (first 100 records)
-- WITH batch AS (
--   SELECT id FROM position_history
--   WHERE gps_time > NOW() + INTERVAL '1 day'
--     AND recorded_at >= NOW() - INTERVAL '7 days'
--   ORDER BY recorded_at DESC
--   LIMIT 100
-- )
-- UPDATE position_history
-- SET gps_time = NOW()
-- FROM batch
-- WHERE position_history.id = batch.id;

-- ============================================================================
-- VERIFICATION: Quick check (FAST - uses LIMIT)
-- ============================================================================
SELECT 
  'position_history' as table_name,
  (SELECT COUNT(*) FROM position_history
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND recorded_at >= NOW() - INTERVAL '7 days'
   LIMIT 1000) as remaining_future
UNION ALL
SELECT 
  'vehicle_positions' as table_name,
  (SELECT COUNT(*) FROM vehicle_positions
   WHERE gps_time > NOW() + INTERVAL '1 day'
     AND cached_at >= NOW() - INTERVAL '7 days'
   LIMIT 1000) as remaining_future;
