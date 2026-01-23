# Debug Realtime Location Updates

## Database Status ✅

- ✅ Realtime is ENABLED for `vehicle_positions`
- ✅ REPLICA IDENTITY is FULL

## Next Steps to Debug

### 1. Check Browser Console

After refreshing the vehicle profile page, look for these logs:

#### Subscription Status:
```
[Realtime] Setting up subscription for device: 358657105966092
[Realtime] Subscription status for 358657105966092: SUBSCRIBED
```

#### When GPS Data Updates:
```
[Realtime] Position update received for 358657105966092: {...}
[Realtime] Mapped data: {...}
[Realtime] ✅ Cache updated and invalidated for 358657105966092
[VehicleLocationMap] Coordinates changed: {...}
```

### 2. Check if Coordinates Are Actually Changing

The location might be stuck because:
- **Vehicle is stationary** - Coordinates aren't changing, so no updates
- **GPS sync hasn't run** - Database hasn't been updated yet
- **Coordinates are the same** - Update happened but values are identical

Look for the debug output at the bottom of the page (development mode):
```
Debug: lat=6.524400, lng=3.379200, updated=2026-01-22T12:34:03.437Z
```

### 3. Verify GPS Sync is Running

Check if the GPS sync job is updating the database:

```sql
-- Check last update time for your device
SELECT 
  device_id,
  gps_time,
  cached_at,
  latitude,
  longitude,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
```

If `minutes_ago` is high (>5 minutes), the GPS sync job might not be running.

### 4. Test Manual Update

To test if Realtime is working, manually update the database:

```sql
-- Update coordinates slightly to trigger Realtime event
UPDATE vehicle_positions
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW()
WHERE device_id = '358657105966092';
```

**Watch the browser console** - you should immediately see:
- `[Realtime] Position update received`
- `[VehicleLocationMap] Coordinates changed`
- Map marker should move

### 5. Check WebSocket Connection

In browser DevTools → Network tab:
- Look for WebSocket connections to Supabase
- Should see `wss://[project].supabase.co/realtime/v1/websocket`
- Status should be "101 Switching Protocols"

### 6. Common Issues

#### Issue: Subscription shows SUBSCRIBED but no updates
**Possible causes:**
- GPS sync job isn't running
- Vehicle is stationary (coordinates not changing)
- Database updates aren't happening

**Solution:**
- Check GPS sync job status
- Verify database is being updated
- Test with manual UPDATE (see Step 4)

#### Issue: Updates appear in console but map doesn't move
**Possible causes:**
- Coordinates are the same (no actual change)
- React not re-rendering
- Map component not detecting prop changes

**Solution:**
- Check debug output shows different coordinates
- Verify React Query cache is updating
- Check for React rendering issues

#### Issue: No subscription logs at all
**Possible causes:**
- Hook not being called
- Device ID is null/undefined
- Component not mounting

**Solution:**
- Check if `useRealtimeVehicleUpdates` is being called
- Verify `deviceId` is not null
- Check component is rendering

## Enhanced Debugging

I've added:
- ✅ Detailed console logging in realtime hook
- ✅ Coordinate change logging in map component
- ✅ Debug output showing current coordinates (dev mode)
- ✅ Cache invalidation to force UI updates

## Expected Behavior

1. **Page loads** → Subscription connects → Console shows `SUBSCRIBED`
2. **GPS sync runs** → Database updates → Realtime event fires
3. **Console logs update** → Cache updates → Map marker moves
4. **Timestamp refreshes** → "Updated" time changes

If you see subscription logs but no position updates, the GPS sync job might not be updating the database, or the vehicle is stationary.
