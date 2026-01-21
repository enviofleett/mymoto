-- ============================================================================
-- Check Ignition Confidence Status
-- ============================================================================
-- Quick verification queries to see current state of ignition confidence data
-- ============================================================================

-- Check vehicle_positions: Count records with/without confidence
SELECT 
  'vehicle_positions' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  COUNT(*) as total_records,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / COUNT(*), 1) as percent_populated
FROM vehicle_positions

UNION ALL

-- Check position_history: Count records with/without confidence
SELECT 
  'position_history' as table_name,
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  COUNT(*) as total_records,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) / COUNT(*), 1) as percent_populated
FROM position_history;

-- Show sample records with confidence (if any)
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  status_text,
  gps_time
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
ORDER BY gps_time DESC
LIMIT 5;

-- Show sample records without confidence
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  status_text,
  gps_time
FROM vehicle_positions
WHERE ignition_confidence IS NULL
ORDER BY gps_time DESC
LIMIT 5;

-- Summary by detection method (if any data exists)
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence,
  ROUND(MIN(ignition_confidence)::NUMERIC, 3) as min_confidence,
  ROUND(MAX(ignition_confidence)::NUMERIC, 3) as max_confidence
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;
