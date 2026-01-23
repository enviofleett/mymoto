-- ============================================================================
-- Monitor Ignition Events After Deployment
-- ============================================================================

-- 1. Check for new ignition events (last hour)
SELECT 
  event_type,
  COUNT(*) as event_count,
  MAX(created_at) as latest_event,
  MIN(created_at) as earliest_event
FROM proactive_vehicle_events
WHERE event_type IN ('ignition_on', 'ignition_off')
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type
ORDER BY event_type;

-- 2. See recent ignition events with vehicle details
SELECT 
  e.event_type,
  e.device_id,
  v.device_name,
  e.title,
  e.message,
  e.created_at,
  e.metadata->>'detected_by' as detected_by,
  e.metadata->>'battery_percent' as battery_percent
FROM proactive_vehicle_events e
LEFT JOIN vehicles v ON v.device_id = e.device_id
WHERE e.event_type IN ('ignition_on', 'ignition_off')
  AND e.created_at > NOW() - INTERVAL '1 hour'
ORDER BY e.created_at DESC
LIMIT 20;

-- 3. Check vehicles that should trigger events (currently running)
-- These vehicles are running but may not have triggered events yet
-- (because they were already running before the fix)
SELECT 
  vp.device_id,
  v.device_name,
  vp.ignition_on,
  vp.speed,
  vp.gps_time,
  -- Check if there's a recent ignition_on event
  (SELECT COUNT(*) 
   FROM proactive_vehicle_events 
   WHERE device_id = vp.device_id 
     AND event_type = 'ignition_on'
     AND created_at > NOW() - INTERVAL '1 hour') as recent_ignition_on_events
FROM vehicle_positions vp
LEFT JOIN vehicles v ON v.device_id = vp.device_id
WHERE vp.ignition_on = true
  AND vp.gps_time > NOW() - INTERVAL '1 hour'
ORDER BY vp.gps_time DESC
LIMIT 20;

-- 4. Verify trigger is working (check for events with 'vehicle_positions_update' in metadata)
SELECT 
  event_type,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM proactive_vehicle_events
WHERE event_type IN ('ignition_on', 'ignition_off')
  AND metadata->>'detected_by' = 'vehicle_positions_update'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;

-- 5. Compare detection sources (position_history vs vehicle_positions)
SELECT 
  event_type,
  metadata->>'detected_by' as detected_by,
  COUNT(*) as count
FROM proactive_vehicle_events
WHERE event_type IN ('ignition_on', 'ignition_off')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type, metadata->>'detected_by'
ORDER BY event_type, detected_by;
