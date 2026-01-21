-- ============================================================================
-- Backfill Ignition Confidence - Last 1 Day Only (Ultra Minimal Scope)
-- ============================================================================
-- This script populates ignition_confidence and ignition_detection_method
-- for records in the last 24 hours only to avoid timeouts.
--
-- IMPORTANT: Run STEP 1 and STEP 2 SEPARATELY!
-- If either times out, skip it - the gps-data function will populate
-- these fields automatically going forward.
-- ============================================================================

-- ============================================================================
-- STEP 1: Backfill vehicle_positions ONLY (Last 1 Day)
-- ============================================================================
-- Run this FIRST. Check results before proceeding to STEP 2.

-- Update records with status_text containing ACC patterns (highest confidence)
UPDATE public.vehicle_positions
SET 
  ignition_confidence = CASE
    WHEN status_text ~* 'ACC\s*(ON|:ON|_ON|=ON)' THEN 0.9
    WHEN status_text ~* 'ACC\s*(OFF|:OFF|_OFF|=OFF)' THEN 0.9
    ELSE NULL
  END,
  ignition_detection_method = CASE
    WHEN status_text ~* 'ACC\s*(ON|OFF|:ON|:OFF|_ON|_OFF|=ON|=OFF)' THEN 'string_parse'
    ELSE NULL
  END
WHERE ignition_confidence IS NULL
  AND status_text IS NOT NULL
  AND status_text ~* 'ACC'
  AND (last_synced_at >= NOW() - INTERVAL '1 day' OR gps_time >= NOW() - INTERVAL '1 day');

-- Update records with speed-based inference (lower confidence)
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
  AND (last_synced_at >= NOW() - INTERVAL '1 day' OR gps_time >= NOW() - INTERVAL '1 day');

-- Set unknown for remaining null records
UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND (last_synced_at >= NOW() - INTERVAL '1 day' OR gps_time >= NOW() - INTERVAL '1 day');

-- Verify STEP 1 results
SELECT 
  'vehicle_positions (last 1 day)' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as percent_complete
FROM public.vehicle_positions
WHERE (last_synced_at >= NOW() - INTERVAL '1 day' OR gps_time >= NOW() - INTERVAL '1 day');

-- ============================================================================
-- STEP 2: Backfill position_history ONLY (Last 1 Day)
-- ============================================================================
-- Run this SEPARATELY after STEP 1 completes successfully.
-- If this times out, it's OK - skip it. The gps-data function will populate
-- position_history automatically going forward.

-- Update records with speed-based inference
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
  AND recorded_at >= NOW() - INTERVAL '1 day';

-- Set unknown for remaining null records
UPDATE public.position_history
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND recorded_at >= NOW() - INTERVAL '1 day';

-- Verify STEP 2 results
SELECT 
  'position_history (last 1 day)' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as percent_complete
FROM public.position_history
WHERE recorded_at >= NOW() - INTERVAL '1 day';

-- ============================================================================
-- STEP 3: Final Summary (Run after both steps complete)
-- ============================================================================

-- Summary by detection method for vehicle_positions
SELECT 
  'vehicle_positions' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND (last_synced_at >= NOW() - INTERVAL '1 day' OR gps_time >= NOW() - INTERVAL '1 day')
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- Summary by detection method for position_history
SELECT 
  'position_history' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.position_history
WHERE ignition_confidence IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '1 day'
GROUP BY ignition_detection_method
ORDER BY count DESC;
