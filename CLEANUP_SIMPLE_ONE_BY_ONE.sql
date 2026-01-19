-- Cleanup Invalid Timestamps - SIMPLEST VERSION
-- Process ONE record at a time - guaranteed no timeout
-- Use this if even the ultra-fast version times out

-- ============================================================================
-- STEP 1: Find one invalid record (FAST)
-- ============================================================================
SELECT 
  id,
  device_id,
  gps_time,
  recorded_at
FROM position_history
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY recorded_at DESC
LIMIT 1;

-- ============================================================================
-- STEP 2: Update that ONE record (replace ID with result from Step 1)
-- ============================================================================
-- Copy the ID from Step 1 result, then run:

-- UPDATE position_history
-- SET gps_time = NULL
-- WHERE id = 'PASTE_ID_HERE';

-- ============================================================================
-- ALTERNATIVE: Automated loop (if your SQL client supports it)
-- ============================================================================
-- This processes records one by one automatically
-- WARNING: May take a long time if you have many records

DO $$
DECLARE
  record_id UUID;
  processed_count INTEGER := 0;
BEGIN
  LOOP
    -- Get next invalid record
    SELECT id INTO record_id
    FROM position_history
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND recorded_at >= NOW() - INTERVAL '7 days'
    ORDER BY recorded_at DESC
    LIMIT 1;
    
    -- Exit if no more records
    EXIT WHEN record_id IS NULL;
    
    -- Update the record
    UPDATE position_history
    SET gps_time = NULL
    WHERE id = record_id;
    
    processed_count := processed_count + 1;
    
    -- Log progress every 100 records
    IF processed_count % 100 = 0 THEN
      RAISE NOTICE 'Processed % records', processed_count;
    END IF;
    
    -- Safety limit: stop after 10000 records
    EXIT WHEN processed_count >= 10000;
  END LOOP;
  
  RAISE NOTICE 'Completed. Processed % records total', processed_count;
END $$;

-- ============================================================================
-- For vehicle_positions (smaller table, can process more at once)
-- ============================================================================
-- Find one invalid record
SELECT 
  id,
  device_id,
  gps_time,
  cached_at
FROM vehicle_positions
WHERE gps_time > NOW() + INTERVAL '1 day'
  AND cached_at >= NOW() - INTERVAL '7 days'
ORDER BY cached_at DESC
LIMIT 1;

-- Update that record (replace ID)
-- UPDATE vehicle_positions
-- SET gps_time = NULL
-- WHERE id = 'PASTE_ID_HERE';

-- Automated loop for vehicle_positions
DO $$
DECLARE
  record_id UUID;
  processed_count INTEGER := 0;
BEGIN
  LOOP
    SELECT id INTO record_id
    FROM vehicle_positions
    WHERE gps_time > NOW() + INTERVAL '1 day'
      AND cached_at >= NOW() - INTERVAL '7 days'
    ORDER BY cached_at DESC
    LIMIT 1;
    
    EXIT WHEN record_id IS NULL;
    
    UPDATE vehicle_positions
    SET gps_time = NULL
    WHERE id = record_id;
    
    processed_count := processed_count + 1;
    
    IF processed_count % 50 = 0 THEN
      RAISE NOTICE 'Processed % records', processed_count;
    END IF;
    
    EXIT WHEN processed_count >= 5000;
  END LOOP;
  
  RAISE NOTICE 'Completed. Processed % records total', processed_count;
END $$;
