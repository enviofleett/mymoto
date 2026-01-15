-- ============================================
-- VERIFY COMPLETE PROACTIVE ALARM FLOW
-- ============================================

-- Step 1: Check the alarm that was created
SELECT 
    id,
    device_id,
    event_type,
    severity,
    title,
    message,
    created_at
FROM proactive_vehicle_events
WHERE id = 'cd4af27f-15dc-458e-93ee-ce138bfe5eef';

-- Step 2: Check if chat message was created for this alarm
SELECT 
    vch.id as chat_id,
    vch.device_id,
    vch.role,
    vch.content,
    vch.is_proactive,
    vch.alert_id,
    vch.created_at as chat_created_at,
    pve.title as alarm_title,
    pve.created_at as alarm_created_at
FROM vehicle_chat_history vch
LEFT JOIN proactive_vehicle_events pve ON pve.id = vch.alert_id
WHERE vch.alert_id = 'cd4af27f-15dc-458e-93ee-ce138bfe5eef';

-- Step 3: Check all proactive messages for this device
SELECT 
    COUNT(*) as total_proactive_messages,
    MAX(created_at) as latest_proactive_message
FROM vehicle_chat_history
WHERE device_id = '358657105967694'
  AND is_proactive = true;

-- Step 4: List recent proactive messages
SELECT 
    vch.id,
    vch.role,
    LEFT(vch.content, 150) as content_preview,
    vch.is_proactive,
    vch.created_at,
    pve.title as alarm_title,
    pve.severity
FROM vehicle_chat_history vch
LEFT JOIN proactive_vehicle_events pve ON pve.id = vch.alert_id
WHERE vch.device_id = '358657105967694'
  AND vch.is_proactive = true
ORDER BY vch.created_at DESC
LIMIT 10;
