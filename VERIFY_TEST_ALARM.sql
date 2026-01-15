-- ============================================
-- VERIFY TEST ALARM WAS CREATED
-- ============================================
-- Run this to check if the alarm was created and processed

-- 1. Check if the alarm was created
SELECT 
    id,
    device_id,
    event_type,
    severity,
    title,
    message,
    created_at
FROM proactive_vehicle_events
WHERE device_id = '358657105967694'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check if a chat message was created from the alarm
SELECT 
    vch.id,
    vch.device_id,
    vch.role,
    vch.content,
    vch.is_proactive,
    vch.alert_id,
    vch.created_at,
    pve.title as alarm_title
FROM vehicle_chat_history vch
LEFT JOIN proactive_vehicle_events pve ON pve.id = vch.alert_id
WHERE vch.device_id = '358657105967694'
  AND vch.is_proactive = true
ORDER BY vch.created_at DESC
LIMIT 5;

-- 3. Summary: Count alarms and proactive messages
SELECT 
    (SELECT COUNT(*) FROM proactive_vehicle_events WHERE device_id = '358657105967694') as total_alarms,
    (SELECT COUNT(*) FROM vehicle_chat_history WHERE device_id = '358657105967694' AND is_proactive = true) as proactive_messages;
