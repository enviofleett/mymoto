# Vehicle Location Update Fix

## Issue
Vehicle location on the map is stale - not updating in real-time on the vehicle profile page.

## Root Cause Analysis

The map component receives coordinates from `liveData?.latitude` and `liveData?.longitude`, which comes from:
1. `useVehicleLiveData(deviceId)` - Polls every 15 seconds
2. `useRealtimeVehicleUpdates(deviceId, { forceEnable: true })` - Subscribes to realtime updates
3. `useVehicleLiveDataHeartbeat(deviceId)` - Additional 15s polling

## Fixes Applied

### 1. Map Component Key Prop ✅
**File:** `src/pages/owner/OwnerVehicleProfile/components/VehicleMapSection.tsx`

Added a key prop based on coordinates and heading to force re-renders when location changes:
```typescript
<VehicleLocationMap
  key={`${latitude?.toFixed(4)}-${longitude?.toFixed(4)}-${heading || 0}`}
  // ... other props
/>
```

### 2. Improved Coordinate Change Detection ✅
**File:** `src/components/fleet/VehicleLocationMap.tsx`

- Added `lastCoordinates` ref to track previous coordinates
- Only pan/fly map if coordinates changed significantly (> 10 meters)
- Always update marker to reflect latest state (heading, speed, status)

### 3. Enhanced Realtime Updates ✅
**File:** `src/hooks/useRealtimeVehicleUpdates.ts`

- Improved logging to show coordinate changes in realtime updates
- Changed `invalidateQueries` to use `refetchType: 'active'` for better performance
- Better debugging output

### 4. Reduced Stale Time ✅
**File:** `src/hooks/useVehicleLiveData.ts`

- Reduced `staleTime` from 30s to 5s for more aggressive updates
- Added `refetchOnReconnect: true` to refetch when connection is restored

### 5. Environment Variable Gating ✅
- Changed `process.env.NODE_ENV === 'development'` to `import.meta.env.DEV`
- Consistent with Vite's environment variable system

## Verification Steps

1. **Check Realtime Subscription:**
   - Open browser console (DevTools)
   - Look for `[Realtime] LIVE updates active for device` message
   - Look for `[Realtime] vehicle_positions UPDATE for` messages

2. **Check Map Updates:**
   - Look for `[VehicleLocationMap] Updating marker:` logs in console
   - Verify coordinates are changing in the logs

3. **Check Polling:**
   - Network tab should show requests to `vehicle_positions` every 15 seconds
   - Verify responses contain updated coordinates

4. **Test Manual Refresh:**
   - Click the refresh button on the map
   - Verify location updates immediately

## Expected Behavior

- **Realtime Updates:** Map should update within 1-2 seconds of database change
- **Polling Fallback:** If realtime fails, polling every 15 seconds ensures updates
- **Smooth Animation:** Map marker moves smoothly when location changes
- **No Stale Data:** Map always shows latest known location

## Troubleshooting

If location is still stale:

1. **Check Realtime Subscription:**
   ```javascript
   // In browser console:
   // Should see subscription status logs
   ```

2. **Check Database Updates:**
   ```sql
   SELECT device_id, latitude, longitude, updated_at, cached_at
   FROM vehicle_positions
   WHERE device_id = 'YOUR_DEVICE_ID'
   ORDER BY updated_at DESC
   LIMIT 1;
   ```

3. **Check Query Cache:**
   ```javascript
   // In React DevTools, check React Query DevTools
   // Look for 'vehicle-live-data' query
   // Verify data is updating
   ```

4. **Force Refresh:**
   - Click the refresh button on the map
   - Check if location updates

## Additional Notes

- The map uses a key prop to force re-renders when coordinates change
- Marker is always updated to reflect latest state (even if coordinates are same)
- Realtime subscription has automatic reconnection logic
- Polling provides fallback if realtime fails
