-- ============================================================================
-- Backfill Ignition Confidence - Batch Processing (For Very Large Tables)
-- ============================================================================
-- Use this version if BACKFILL_IGNITION_CONFIDENCE_FAST.sql still times out.
-- This processes records in smaller batches using CTID-based pagination.
--
-- Run each batch separately, checking progress between batches.
-- ============================================================================

-- ============================================================================
-- BATCH 1: vehicle_positions - Status text parsing (highest confidence)
-- ============================================================================
-- Run this batch first, then check results before proceeding

UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.9,
  ignition_detection_method = 'string_parse'
WHERE ignition_confidence IS NULL
  AND status_text IS NOT NULL
  AND status_text ~* 'ACC\s*(ON|OFF|:ON|:OFF|_ON|_OFF|=ON|=OFF)'
  AND ctid IN (
    SELECT ctid FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
      AND status_text IS NOT NULL
      AND status_text ~* 'ACC'
    LIMIT 1000
  );

-- Check progress
SELECT 
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence
FROM public.vehicle_positions;

-- ============================================================================
-- BATCH 2: vehicle_positions - Speed-based inference
-- ============================================================================
-- Run this after Batch 1 completes

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
  AND ctid IN (
    SELECT ctid FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
      AND speed IS NOT NULL
    LIMIT 1000
  );

-- Check progress
SELECT 
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence
FROM public.vehicle_positions;

-- ============================================================================
-- BATCH 3: vehicle_positions - Set remaining to unknown
-- ============================================================================

UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND ctid IN (
    SELECT ctid FROM public.vehicle_positions
    WHERE ignition_confidence IS NULL
    LIMIT 1000
  );

-- ============================================================================
-- BATCH 4: position_history - Speed-based inference (recent records only)
-- ============================================================================
-- Process only last 7 days to avoid timeout

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
  AND ctid IN (
    SELECT ctid FROM public.position_history
    WHERE ignition_confidence IS NULL
      AND speed IS NOT NULL
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 5000
  );

-- Check progress
SELECT 
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence
FROM public.position_history
WHERE recorded_at >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- BATCH 5: position_history - Set remaining to unknown (recent only)
-- ============================================================================

UPDATE public.position_history
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND recorded_at >= NOW() - INTERVAL '7 days'
  AND ctid IN (
    SELECT ctid FROM public.position_history
    WHERE ignition_confidence IS NULL
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 5000
  );

-- ============================================================================
-- Final Verification
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
