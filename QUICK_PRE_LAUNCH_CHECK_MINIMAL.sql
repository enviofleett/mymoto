-- ============================================================================
-- Minimal Pre-Launch Check (Ultra Fast - No Timeouts)
-- ============================================================================
-- Run this if the fast version still times out
-- ============================================================================

-- 1. Timezone (Instant)
SHOW timezone;

-- 2. Recent sync count (Last 1 hour only)
SELECT 
  COUNT(*) FILTER (WHERE last_synced_at >= NOW() - INTERVAL '1 hour') as synced_last_hour,
  MAX(last_synced_at) as most_recent_sync
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour';

-- 3. Sample of recent data (Limited to 10)
SELECT 
  device_id,
  last_synced_at,
  ignition_on,
  ignition_confidence,
  is_online
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour'
ORDER BY last_synced_at DESC
LIMIT 10;

-- 4. Ignition confidence summary (Recent only)
SELECT 
  ignition_detection_method,
  COUNT(*) as count
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
  AND last_synced_at >= NOW() - INTERVAL '6 hours'
GROUP BY ignition_detection_method
ORDER BY count DESC
LIMIT 5;
