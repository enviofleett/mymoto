-- Bulk acknowledge all offline events older than 1 hour (they're historical, not actionable)
UPDATE proactive_vehicle_events 
SET acknowledged = true, acknowledged_at = NOW()
WHERE event_type = 'offline' 
  AND acknowledged IS NOT TRUE
  AND created_at < NOW() - INTERVAL '1 hour';

-- Keep only the most recent offline event per device (delete duplicates)
DELETE FROM proactive_vehicle_events p1
WHERE event_type = 'offline'
  AND EXISTS (
    SELECT 1 FROM proactive_vehicle_events p2
    WHERE p2.device_id = p1.device_id
      AND p2.event_type = 'offline'
      AND p2.created_at > p1.created_at
  );