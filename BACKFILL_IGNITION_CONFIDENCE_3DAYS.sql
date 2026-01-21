-- ============================================================================
-- Backfill Ignition Confidence - Last 3 Days Only (Minimal Scope)
-- ============================================================================
-- This script populates ignition_confidence and ignition_detection_method
-- for records in the last 3 days only to avoid timeouts.
--
-- Strategy:
-- 1. Process vehicle_positions first (smaller table)
-- 2. Process position_history separately (larger table, last 3 days only)
-- 3. Use status_text for string parsing (confidence 0.9)
-- 4. Use speed for speed-based inference (confidence 0.3-0.5)
-- ============================================================================

-- ============================================================================
-- STEP 1: Backfill vehicle_positions (Last 3 Days)
-- ============================================================================

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
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL);

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
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL);

-- Set unknown for remaining null records
UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL);

-- ============================================================================
-- STEP 2: Backfill position_history (Last 3 Days Only)
-- ============================================================================

-- Note: position_history doesn't have status_text column, so we use speed-based inference
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
  AND recorded_at >= NOW() - INTERVAL '3 days';

-- Set unknown for remaining null records
UPDATE public.position_history
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND recorded_at >= NOW() - INTERVAL '3 days';

-- ============================================================================
-- STEP 3: Verify Results (Last 3 Days)
-- ============================================================================

-- Check vehicle_positions backfill results
SELECT 
  'vehicle_positions (last 3 days)' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL)
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- Check position_history backfill results
SELECT 
  'position_history (last 3 days)' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.position_history
WHERE ignition_confidence IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '3 days'
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- Check for any remaining null values
SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) as null_count
FROM public.vehicle_positions
WHERE (ignition_confidence IS NULL OR ignition_detection_method IS NULL)
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL)
UNION ALL
SELECT 
  'position_history' as table_name,
  COUNT(*) as null_count
FROM public.position_history
WHERE (ignition_confidence IS NULL OR ignition_detection_method IS NULL)
  AND recorded_at >= NOW() - INTERVAL '3 days';
