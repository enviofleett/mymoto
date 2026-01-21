-- ============================================================================
-- Backfill Ignition Confidence for Existing Records
-- ============================================================================
-- This script populates ignition_confidence and ignition_detection_method
-- for existing records in vehicle_positions and position_history that have null values.
--
-- Strategy:
-- 1. Use status_text (strstatus) for string parsing (confidence 0.9)
-- 2. Use speed > 5 km/h for speed inference (confidence 0.3-0.5)
-- 3. Use existing ignition_on boolean for multi-signal detection
--
-- Note: This is a simplified backfill. For best accuracy, trigger the
-- gps-data edge function to fetch fresh data with full GPS51 raw fields.
-- ============================================================================

-- ============================================================================
-- STEP 1: Backfill vehicle_positions
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
  AND status_text ~* 'ACC';

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
  AND speed IS NOT NULL;

-- Set unknown for remaining null records
UPDATE public.vehicle_positions
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL;

-- ============================================================================
-- STEP 2: Backfill position_history
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
  AND speed IS NOT NULL;

-- Set unknown for remaining null records
UPDATE public.position_history
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL;

-- ============================================================================
-- STEP 3: Verify Results
-- ============================================================================

-- Check vehicle_positions backfill results
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.vehicle_positions
WHERE ignition_confidence IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- Check position_history backfill results
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM public.position_history
WHERE ignition_confidence IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;

-- Check for any remaining null values
SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) as null_count
FROM public.vehicle_positions
WHERE ignition_confidence IS NULL OR ignition_detection_method IS NULL
UNION ALL
SELECT 
  'position_history' as table_name,
  COUNT(*) as null_count
FROM public.position_history
WHERE ignition_confidence IS NULL OR ignition_detection_method IS NULL;
