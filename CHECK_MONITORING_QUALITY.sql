-- Check Ignition Detection Quality Using Monitoring Functions
-- Run these queries to assess current detection quality

-- ============================================================================
-- 1. Overall Detection Quality (Last 24 Hours)
-- ============================================================================
-- Note: If function doesn't exist, use the manual query in CHECK_FUNCTION_EXISTS.sql
SELECT * FROM check_ignition_detection_quality(24)
ORDER BY device_id, method_count DESC;

-- ============================================================================
-- 2. Detection Quality Summary by Method
-- ============================================================================
SELECT 
  detection_method,
  COUNT(DISTINCT device_id) as device_count,
  SUM(sample_count) as total_samples,
  ROUND(AVG(avg_confidence)::NUMERIC, 3) as overall_avg_confidence,
  ROUND(MIN(avg_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(avg_confidence)::NUMERIC, 3) as max_confidence,
  SUM(ignition_on_count) as total_ignition_on,
  SUM(ignition_off_count) as total_ignition_off
FROM check_ignition_detection_quality(24)
GROUP BY detection_method
ORDER BY total_samples DESC;

-- ============================================================================
-- 3. Devices with Low Confidence (< 0.7)
-- ============================================================================
SELECT 
  device_id,
  detection_method,
  sample_count,
  avg_confidence,
  ignition_on_count,
  ignition_off_count
FROM check_ignition_detection_quality(24)
WHERE avg_confidence < 0.7
ORDER BY avg_confidence ASC;

-- ============================================================================
-- 4. Devices Using Status Bit Detection (Best Method)
-- ============================================================================
SELECT 
  device_id,
  sample_count,
  avg_confidence,
  method_percentage,
  ignition_on_count,
  ignition_off_count
FROM check_ignition_detection_quality(24)
WHERE detection_method = 'status_bit'
ORDER BY sample_count DESC;

-- ============================================================================
-- 5. Devices Using String Parse (Fallback Method)
-- ============================================================================
SELECT 
  device_id,
  sample_count,
  avg_confidence,
  method_percentage,
  ignition_on_count,
  ignition_off_count
FROM check_ignition_detection_quality(24)
WHERE detection_method = 'string_parse'
ORDER BY sample_count DESC;

-- ============================================================================
-- 6. Devices Using Speed Inference (Low Confidence Method)
-- ============================================================================
SELECT 
  device_id,
  sample_count,
  avg_confidence,
  method_percentage,
  ignition_on_count,
  ignition_off_count
FROM check_ignition_detection_quality(24)
WHERE detection_method IN ('speed_inference', 'multi_signal', 'unknown')
ORDER BY avg_confidence ASC;

-- ============================================================================
-- 7. Detection Method Distribution
-- ============================================================================
SELECT 
  detection_method,
  COUNT(DISTINCT device_id) as device_count,
  SUM(sample_count) as total_samples,
  ROUND(SUM(sample_count)::NUMERIC / SUM(SUM(sample_count)) OVER () * 100, 2) as percentage_of_total
FROM check_ignition_detection_quality(24)
GROUP BY detection_method
ORDER BY total_samples DESC;

-- ============================================================================
-- 8. Quality Metrics for Last 7 Days
-- ============================================================================
SELECT * FROM check_ignition_detection_quality(168) -- 7 days = 168 hours
ORDER BY device_id, method_count DESC
LIMIT 100; -- Limit to top 100 results

-- ============================================================================
-- 9. Compare Detection Methods Side-by-Side
-- ============================================================================
WITH method_stats AS (
  SELECT 
    device_id,
    detection_method,
    sample_count,
    avg_confidence
  FROM check_ignition_detection_quality(24)
)
SELECT 
  device_id,
  MAX(CASE WHEN detection_method = 'status_bit' THEN sample_count END) as status_bit_samples,
  MAX(CASE WHEN detection_method = 'status_bit' THEN avg_confidence END) as status_bit_confidence,
  MAX(CASE WHEN detection_method = 'string_parse' THEN sample_count END) as string_parse_samples,
  MAX(CASE WHEN detection_method = 'string_parse' THEN avg_confidence END) as string_parse_confidence,
  MAX(CASE WHEN detection_method = 'speed_inference' THEN sample_count END) as speed_inference_samples,
  MAX(CASE WHEN detection_method = 'speed_inference' THEN avg_confidence END) as speed_inference_confidence
FROM method_stats
GROUP BY device_id
ORDER BY device_id;
