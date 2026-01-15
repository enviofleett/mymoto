-- ============================================
-- CHECK WEBHOOK DELIVERY AND CHAT MESSAGE
-- ============================================

-- 1. Check if a chat message was created from the alarm
SELECT 
    vch.id,
    vch.device_id,
    vch.role,
    LEFT(vch.content, 100) as content_preview,
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

-- 2. Check the specific alarm that was just created
SELECT 
    id,
    device_id,
    event_type,
    severity,
    title,
    message,
    created_at
FROM proactive_vehicle_events
WHERE id = '6a05d645-61b0-44fc-89da-ad73b30df3f8';

-- 3. Summary: Count proactive messages for this device
SELECT 
    COUNT(*) as total_proactive_messages,
    MAX(created_at) as latest_proactive_message
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true;
