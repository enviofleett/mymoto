# Diagnosis: Device-Specific Issue

## Summary

✅ **GPS Sync Job**: Working (device 13612332543 updated 3 min ago)
✅ **Realtime System**: Configured correctly
❌ **Device 358657105966092**: Not receiving GPS updates from GPS51

## Evidence

| Device | Last Updated | Status |
|--------|-------------|--------|
| 13612332543 | 3 minutes ago | ✅ Working |
| 358657105966092 | 79 minutes ago | ❌ Not updating |

## Root Cause

Device 358657105966092 is not being updated by the GPS sync job, which means:
- GPS51 API is not returning data for this device
- Device might be offline in GPS51
- Device might not be in the GPS51 device list
- Device might have been removed from GPS51

## Verification Steps

### 1. Check if Device Exists in Database

```sql
SELECT 
  device_id,
  device_name,
  last_synced_at
FROM vehicles
WHERE device_id = '358657105966092';
```

### 2. Check Device Status

```sql
SELECT 
  device_id,
  is_online,
  gps_time,
  CASE 
    WHEN is_online = false THEN 'Offline'
    WHEN EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 > 10 THEN 'Stale data'
    ELSE 'Online'
  END as status
FROM vehicle_positions
WHERE device_id = '358657105966092';
```

### 3. Check Recent Position History

```sql
SELECT 
  gps_time,
  EXTRACT(EPOCH FROM (NOW() - gps_time)) / 60 AS minutes_ago
FROM position_history
WHERE device_id = '358657105966092'
ORDER BY gps_time DESC
LIMIT 5;
```

If no recent history, the device hasn't been reporting GPS data.

## Test Realtime with Working Device

To confirm Realtime works, test with device 13612332543:

1. **Open vehicle profile** for device 13612332543
2. **Open browser console** (F12)
3. **Run this SQL:**
```sql
UPDATE vehicle_positions
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW()
WHERE device_id = '13612332543';
```
4. **Watch console** - should see realtime update logs
5. **Check map** - marker should move instantly

If this works, Realtime is fine - the issue is just that device 358657105966092 isn't getting GPS updates.

## Solution

The realtime system is working correctly. The issue is that device 358657105966092 needs to:
1. Come online in GPS51
2. Report GPS data
3. Then the sync job will update it
4. Then Realtime will fire
5. Then location will update

You can't force GPS updates if the device isn't reporting to GPS51.
