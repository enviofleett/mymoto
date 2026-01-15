-- Check if proactive chat message was created
-- Run this after creating a test alarm

-- 1. Check the most recent alarm
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
LIMIT 1;

-- 2. Check if a chat message was created from this alarm
SELECT 
    vch.id,
    vch.device_id,
    vch.role,
    LEFT(vch.content, 200) as content_preview,
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

-- 3. Check the specific alarm from the log (cd4af27f-15dc-458e-93ee-ce138bfe5eef)
SELECT 
    vch.id,
    vch.device_id,
    vch.role,
    vch.content,
    vch.is_proactive,
    vch.alert_id,
    vch.created_at
FROM vehicle_chat_history vch
WHERE vch.alert_id = 'cd4af27f-15dc-458e-93ee-ce138bfe5eef';
