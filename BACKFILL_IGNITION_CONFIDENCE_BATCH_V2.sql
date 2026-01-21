-- ============================================================================
-- Backfill Ignition Confidence - Device-Based Batch Processing
-- ============================================================================
-- Use this version if BACKFILL_IGNITION_CONFIDENCE_FAST.sql still times out.
-- This processes records by device_id in batches to avoid timeouts.
--
-- Strategy: Process one device at a time or small groups of devices
-- ============================================================================

-- ============================================================================
-- STEP 1: Check how many devices need processing
-- ============================================================================
SELECT 
  COUNT(DISTINCT device_id) as total_devices,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as records_without_confidence,
  COUNT(*) as total_records
FROM public.vehicle_positions;

-- ============================================================================
-- STEP 2: Backfill vehicle_positions - Process by device (run multiple times)
-- ============================================================================
-- Run this query multiple times, each time it will process one device
-- Continue until no more devices are returned

-- Batch 1: Status text parsing (highest confidence)
UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.9,
  ignition_detection_method = 'string_parse'
WHERE ignition_confidence IS NULL
  AND status_text IS NOT NULL
  AND status_text ~* 'ACC\s*(ON|OFF|:ON|:OFF|_ON|_OFF|=ON|=OFF)'
  AND device_id IN (
    SELECT DISTINCT device_id 
    FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
      AND status_text IS NOT NULL
      AND status_text ~* 'ACC'
    LIMIT 10  -- Process 10 devices at a time
  );

-- Batch 2: Speed-based inference
UPDATE public.vehicle_positions
SET 
  ignition_confidence = CASE
    WHEN speed > 5 AND ignition_on = true THEN 0.4
    WHEN speed > 3 AND ignition_on = true THEN 0.3
    WHEN speed <= 3 AND ignition_on = false THEN 0.5
    ELSE 0.0
  END,
  ignition_detection_method = CASE
    WHEN speed > 5 AND ignition_on = true THEN 'speed_inference'
    WHEN speed > 3 AND ignition_on = true THEN 'speed_inference'
    WHEN speed <= 3 AND ignition_on = false THEN 'speed_inference'
    ELSE 'unknown'
  END
WHERE ignition_confidence IS NULL
  AND speed IS NOT NULL
  AND device_id IN (
    SELECT DISTINCT device_id 
    FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
      AND speed IS NOT NULL
    LIMIT 10  -- Process 10 devices at a time
  );

-- Batch 3: Set remaining to unknown
UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND device_id IN (
    SELECT DISTINCT device_id 
    FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
    LIMIT 10  -- Process 10 devices at a time
  );

-- ============================================================================
-- STEP 3: Check progress after each batch
-- ============================================================================
SELECT 
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / COUNT(*), 1) as percent_complete
FROM public.vehicle_positions;

-- ============================================================================
-- STEP 4: Backfill position_history - Recent records only (last 7 days)
-- ============================================================================
-- Process in time-based batches to avoid timeout

UPDATE public.position_history
SET 
  ignition_confidence = CASE
    WHEN speed > 5 AND ignition_on = true THEN 0.4
    WHEN speed > 3 AND ignition_on = true THEN 0.3
    WHEN speed <= 3 AND ignition_on = false THEN 0.5
    ELSE 0.0
  END,
  ignition_detection_method = CASE
    WHEN speed > 5 AND ignition_on = true THEN 'speed_inference'
    WHEN speed > 3 AND ignition_on = true THEN 'speed_inference'
    WHEN speed <= 3 AND ignition_on = false THEN 'speed_inference'
    ELSE 'unknown'
  END
WHERE ignition_confidence IS NULL
  AND speed IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '7 days'
  AND recorded_at < NOW() - INTERVAL '6 days';  -- Process one day at a time

-- Repeat for other days by changing the interval:
-- AND recorded_at >= NOW() - INTERVAL '6 days' AND recorded_at < NOW() - INTERVAL '5 days'
-- AND recorded_at >= NOW() - INTERVAL '5 days' AND recorded_at < NOW() - INTERVAL '4 days'
-- ... and so on

-- ============================================================================
-- STEP 5: Final Verification
-- ============================================================================

SELECT 
  'vehicle_positions' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM public.vehicle_positions
WHERE ignition_confidence IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;

SELECT 
  'position_history (last 7 days)' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM public.position_history
WHERE ignition_confidence IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '7 days'
GROUP BY ignition_detection_method
ORDER BY count DESC;
