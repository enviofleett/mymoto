# Notification System Simulation Test Plan

## Overview
This document provides step-by-step test scenarios to verify the notification system works correctly in production.

---

## Prerequisites

1. ✅ Database migration run (`vehicle_notification_preferences` table exists)
2. ✅ Edge functions deployed
3. ✅ Database webhook configured
4. ✅ User authenticated
5. ✅ Vehicle assigned to user

---

## Test Scenario 1: Battery Low Alert

### Setup:
```sql
-- Enable low_battery for Vehicle A
INSERT INTO vehicle_notification_preferences (user_id, device_id, low_battery)
VALUES ('USER_ID', 'VEHICLE_A', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET low_battery = true;

-- Disable low_battery for Vehicle B
INSERT INTO vehicle_notification_preferences (user_id, device_id, low_battery)
VALUES ('USER_ID', 'VEHICLE_B', false)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET low_battery = false;
```

### Test:
```sql
-- Trigger low battery event for Vehicle A
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  'VEHICLE_A',
  'low_battery',
  'warning',
  'Low Battery Alert',
  'Battery at 18%',
  '{"battery_percent": 18}'
);

-- Trigger low battery event for Vehicle B
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  'VEHICLE_B',
  'low_battery',
  'warning',
  'Low Battery Alert',
  'Battery at 18%',
  '{"battery_percent": 18}'
);
```

### Expected Results:
- ✅ Vehicle A: User receives notification (AI chat message + toast)
- ✅ Vehicle B: User does NOT receive notification
- ✅ Edge function logs show preference check

### Verification:
```sql
-- Check chat messages
SELECT * FROM vehicle_chat_history 
WHERE device_id IN ('VEHICLE_A', 'VEHICLE_B')
AND is_proactive = true
ORDER BY created_at DESC;
```

---

## Test Scenario 2: Ignition Start

### Setup:
```sql
-- Enable ignition_on for Vehicle A
INSERT INTO vehicle_notification_preferences (user_id, device_id, ignition_on)
VALUES ('USER_ID', 'VEHICLE_A', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET ignition_on = true;
```

### Test:
```sql
-- Trigger ignition_on event
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata,
  latitude, longitude
) VALUES (
  'VEHICLE_A',
  'ignition_on',
  'info',
  'Vehicle Started',
  'Ignition turned on',
  '{"ignition": true}',
  6.5243,
  3.3792
);
```

### Expected Results:
- ✅ AI chat message appears in vehicle chat
- ✅ Message includes location tag
- ✅ Message uses vehicle personality
- ✅ Edge function logs show preference check passed

---

## Test Scenario 3: Morning Greeting

### Setup:
```sql
-- Enable morning_greeting for Vehicle A
INSERT INTO vehicle_notification_preferences (user_id, device_id, morning_greeting)
VALUES ('USER_ID', 'VEHICLE_A', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET morning_greeting = true;
```

### Test:
```bash
# Manually trigger morning briefing
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/morning-briefing \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "VEHICLE_A"}'
```

### Expected Results:
- ✅ Morning briefing appears in chat
- ✅ Briefing includes night status and yesterday's stats
- ✅ Briefing uses vehicle personality

### Disable Test:
```sql
-- Disable morning_greeting
UPDATE vehicle_notification_preferences
SET morning_greeting = false
WHERE user_id = 'USER_ID' AND device_id = 'VEHICLE_A';
```

### Expected Results:
- ✅ No morning briefing generated
- ✅ Edge function logs show preference check failed

---

## Test Scenario 4: Critical Battery (Default Enabled)

### Setup:
```sql
-- No preferences set (new user)
-- OR explicitly set to default
INSERT INTO vehicle_notification_preferences (user_id, device_id, critical_battery)
VALUES ('USER_ID', 'VEHICLE_A', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET critical_battery = true;
```

### Test:
```sql
-- Trigger critical battery event
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata
) VALUES (
  'VEHICLE_A',
  'critical_battery',
  'critical',
  'Critical Battery Alert',
  'Battery at 8% - immediate attention required',
  '{"battery_percent": 8}'
);
```

### Expected Results:
- ✅ User receives notification (default enabled)
- ✅ Toast notification appears
- ✅ Push notification (if enabled)
- ✅ Email notification (critical severity)
- ✅ AI chat message

---

## Test Scenario 5: Geofence Event

### Setup:
```sql
-- Enable geofence_enter for Vehicle A
INSERT INTO vehicle_notification_preferences (user_id, device_id, geofence_enter)
VALUES ('USER_ID', 'VEHICLE_A', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET geofence_enter = true;
```

### Test:
```sql
-- Trigger geofence_enter event (usually from check-geofences function)
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message, metadata,
  latitude, longitude, location_name
) VALUES (
  'VEHICLE_A',
  'geofence_enter',
  'info',
  'Arrived at Home',
  'Vehicle has arrived at Home',
  '{"geofence_id": "home-zone"}',
  6.5243,
  3.3792,
  'Home'
);
```

### Expected Results:
- ✅ AI chat message with location
- ✅ Toast notification
- ✅ Message includes geofence name

---

## Test Scenario 6: Multiple Users, Same Vehicle

### Setup:
```sql
-- User A enables low_battery
INSERT INTO vehicle_notification_preferences (user_id, device_id, low_battery)
VALUES ('USER_A_ID', 'VEHICLE_X', true)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET low_battery = true;

-- User B disables low_battery
INSERT INTO vehicle_notification_preferences (user_id, device_id, low_battery)
VALUES ('USER_B_ID', 'VEHICLE_X', false)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET low_battery = false;
```

### Test:
```sql
-- Trigger low battery event
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
) VALUES (
  'VEHICLE_X',
  'low_battery',
  'warning',
  'Low Battery Alert',
  'Battery at 18%'
);
```

### Expected Results:
- ✅ User A: Receives notification
- ✅ User B: Does NOT receive notification
- ✅ Chat messages only for User A

### Verification:
```sql
-- Check chat messages per user
SELECT user_id, content, created_at 
FROM vehicle_chat_history 
WHERE device_id = 'VEHICLE_X'
AND is_proactive = true
ORDER BY created_at DESC;
```

---

## Test Scenario 7: Edge Function Error Handling

### Test: Invalid Event Type
```sql
-- Try to insert invalid event (should be caught by enum)
-- This should fail at database level
```

### Test: Missing Preferences
```sql
-- Trigger event for user with no preferences set
-- Should use defaults (critical events enabled)
```

### Expected Results:
- ✅ Default-enabled events still work
- ✅ Non-default events are skipped
- ✅ Edge function logs show fallback behavior

---

## Test Scenario 8: Real-Time Notifications

### Setup:
1. Open app in browser
2. Enable push notifications
3. Enable sound alerts
4. Set notification preferences

### Test:
```sql
-- Trigger critical event
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
) VALUES (
  'VEHICLE_A',
  'critical_battery',
  'critical',
  'Critical Battery',
  'Battery at 5%'
);
```

### Expected Results:
- ✅ Toast notification appears immediately
- ✅ Sound plays (if enabled)
- ✅ Push notification appears (if permission granted)
- ✅ AI chat message appears
- ✅ Email sent (if configured)

---

## Verification Queries

### Check Preferences:
```sql
SELECT * FROM vehicle_notification_preferences
WHERE user_id = 'USER_ID' AND device_id = 'VEHICLE_ID';
```

### Check Events:
```sql
SELECT * FROM proactive_vehicle_events
WHERE device_id = 'VEHICLE_ID'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Chat Messages:
```sql
SELECT * FROM vehicle_chat_history
WHERE device_id = 'VEHICLE_ID'
AND is_proactive = true
ORDER BY created_at DESC
LIMIT 10;
```

### Check Edge Function Logs:
- Go to Supabase Dashboard → Edge Functions → Logs
- Filter by function name
- Check for preference check logs

---

## Success Criteria

✅ All test scenarios pass:
- Preferences are respected
- Default-enabled events work
- Opt-in events require enablement
- Multiple users work correctly
- Error handling works
- Real-time notifications work

---

## Production Deployment Checklist

- [ ] Deploy `handle-vehicle-event` edge function
- [ ] Deploy `proactive-alarm-to-chat` edge function
- [ ] Deploy `morning-briefing` edge function
- [ ] Verify database webhook is configured
- [ ] Run Test Scenario 1 (Battery Alert)
- [ ] Run Test Scenario 2 (Ignition Start)
- [ ] Run Test Scenario 3 (Morning Greeting)
- [ ] Run Test Scenario 4 (Critical Battery)
- [ ] Run Test Scenario 6 (Multiple Users)
- [ ] Monitor edge function logs for 24 hours
- [ ] Collect user feedback

---

**Status:** ✅ Ready for testing after deployment
