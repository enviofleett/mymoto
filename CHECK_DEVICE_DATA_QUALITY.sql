-- ============================================================================
-- Check Device Data Quality Issues
-- ============================================================================
-- This query identifies devices with data quality problems based on
-- ignition confidence scores and detection methods.
-- ============================================================================

-- Find devices with consistently low confidence or unknown detection method
SELECT 
  device_id,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence < 0.5) as low_confidence_count,
  COUNT(*) FILTER (WHERE ignition_detection_method = 'unknown') as unknown_method_count,
  COUNT(*) FILTER (WHERE ignition_detection_method = 'status_bit') as status_bit_count,
  COUNT(*) FILTER (WHERE ignition_detection_method = 'string_parse') as string_parse_count,
  ROUND(AVG(ignition_confidence) FILTER (WHERE ignition_confidence IS NOT NULL)::NUMERIC, 3) as avg_confidence,
  MIN(ignition_confidence) FILTER (WHERE ignition_confidence IS NOT NULL) as min_confidence,
  MAX(ignition_confidence) FILTER (WHERE ignition_confidence IS NOT NULL) as max_confidence
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 day'
GROUP BY device_id
HAVING 
  COUNT(*) FILTER (WHERE ignition_confidence < 0.5) > 0
  OR COUNT(*) FILTER (WHERE ignition_detection_method = 'unknown') > 0
ORDER BY 
  unknown_method_count DESC,
  low_confidence_count DESC
LIMIT 20;

-- Summary: Devices with missing status_text (affects string parsing)
SELECT 
  COUNT(*) FILTER (WHERE status_text IS NULL OR status_text = '') as missing_status_text,
  COUNT(*) FILTER (WHERE status_text IS NOT NULL AND status_text != '') as has_status_text,
  COUNT(*) as total
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 day';

-- Devices with null status_text and low confidence
SELECT 
  device_id,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence) FILTER (WHERE ignition_confidence IS NOT NULL)::NUMERIC, 3) as avg_confidence
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 day'
  AND (status_text IS NULL OR status_text = '')
  AND (ignition_confidence IS NULL OR ignition_confidence < 0.5)
GROUP BY device_id
ORDER BY count DESC
LIMIT 10;
