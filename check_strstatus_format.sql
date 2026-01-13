-- Check what strstatus values we actually have in position_history
-- This will help us understand why ignition_on is always false

SELECT 
  status_text,
  COUNT(*) AS count,
  COUNT(CASE WHEN ignition_on = true THEN 1 END) AS ignition_true_count,
  COUNT(CASE WHEN ignition_on = false THEN 1 END) AS ignition_false_count
FROM position_history
WHERE device_id = '358657105967694'
  AND gps_time >= date_trunc('day', now())
  AND gps_time < now()
GROUP BY status_text
ORDER BY count DESC
LIMIT 20;

-- Also check vehicle_positions to see current status
SELECT 
  status_text,
  ignition_on,
  gps_time
FROM vehicle_positions
WHERE device_id = '358657105967694'
ORDER BY gps_time DESC
LIMIT 10;
