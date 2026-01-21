-- ============================================================================
-- Backfill Ignition Confidence - Last 3 Days (Separate Execution)
-- ============================================================================
-- Run STEP 1 and STEP 2 SEPARATELY to avoid timeout.
-- If STEP 2 times out, skip it - position_history will be populated
-- automatically by the gps-data function going forward.
-- ============================================================================

-- ============================================================================
-- STEP 1: Backfill vehicle_positions ONLY (Last 3 Days)
-- ============================================================================
-- Run this first. If successful, proceed to STEP 2.

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

-- Verify STEP 1
SELECT 
  'vehicle_positions (last 3 days)' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / COUNT(*), 1) as percent_complete
FROM public.vehicle_positions
WHERE (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL);

-- ============================================================================
-- STEP 2: Backfill position_history ONLY (Last 3 Days)
-- ============================================================================
-- Run this separately AFTER STEP 1 completes successfully.
-- If this times out, it's OK - the gps-data function will populate
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
  AND recorded_at >= NOW() - INTERVAL '3 days';

-- Set unknown for remaining null records
UPDATE public.position_history
SET 
  ignition_confidence = 0.0,
  ignition_detection_method = 'unknown'
WHERE ignition_confidence IS NULL
  AND recorded_at >= NOW() - INTERVAL '3 days';

-- Verify STEP 2
SELECT 
  'position_history (last 3 days)' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / COUNT(*), 1) as percent_complete
FROM public.position_history
WHERE recorded_at >= NOW() - INTERVAL '3 days';

-- ============================================================================
-- STEP 3: Final Summary (Run after both steps)
-- ============================================================================

SELECT 
  'vehicle_positions' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM public.vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND (last_synced_at >= NOW() - INTERVAL '3 days' OR gps_time >= NOW() - INTERVAL '3 days' OR last_synced_at IS NULL)
GROUP BY ignition_detection_method
ORDER BY count DESC;

SELECT 
  'position_history' as table_name,
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM public.position_history
WHERE ignition_confidence IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '3 days'
GROUP BY ignition_detection_method
ORDER BY count DESC;
