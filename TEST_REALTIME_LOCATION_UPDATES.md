# Test & Verify Realtime Location Updates Fix

## 🎯 Objective
Verify that realtime vehicle location updates are working correctly on the vehicle profile page.

---

## ✅ Step 1: Database Configuration Verification

### Run Verification SQL
1. Open **Supabase Dashboard → SQL Editor**
2. Copy and run `VERIFY_REALTIME_FIX.sql`
3. Check results:

**Expected Results:**
- ✅ `publication_status` = "✅ In Realtime Publication"
- ✅ `primary_key_status` = "✅ Has Primary Key"  
- ✅ `replica_identity_status` = "✅ FULL" or "⚠️ DEFAULT (OK if has PK)"

**If any check fails:**
- Run `APPLY_REALTIME_FIX.sql` in Supabase SQL Editor
- Re-run verification

---

## ✅ Step 2: Code Implementation Check

### Verify Hook is Used
**File:** `src/pages/owner/OwnerVehicleProfile/index.tsx`

**Check:**
```typescript
// Should have this import:
import { useRealtimeVehicleUpdates } from "@/hooks/useRealtimeVehicleUpdates";

// Should call the hook:
useRealtimeVehicleUpdates(deviceId);
```

**Status:** ✅ **VERIFIED** - Hook is imported and called on line 33 and 81

### Verify Hook Implementation
**File:** `src/hooks/useRealtimeVehicleUpdates.ts`

**Check:**
- ✅ Subscribes to `vehicle_positions` table
- ✅ Filters by `device_id`
- ✅ Updates React Query cache
- ✅ Logs console messages for debugging

**Status:** ✅ **VERIFIED** - Implementation is correct

---

## ✅ Step 3: Browser Testing

### Prerequisites
- Development server running: `npm run dev`
- Browser DevTools Console open (F12)

### Test Steps

1. **Navigate to Vehicle Profile:**
   ```
   http://localhost:5173/owner/vehicle/[DEVICE_ID]
   ```
   Replace `[DEVICE_ID]` with an actual device ID

2. **Check Console for Subscription:**
   Look for these messages:
   ```
   [Realtime] 🔵 Setting up subscription for device: [deviceId]
   [Realtime] 📡 Subscription status for [deviceId]: SUBSCRIBED
   [Realtime] ✅ Successfully subscribed to vehicle_positions updates for [deviceId]
   [Realtime] 🎯 Waiting for position updates...
   ```

3. **Check Network Tab:**
   - Open DevTools → Network tab
   - Filter by "WS" (WebSocket)
   - Should see WebSocket connection to Supabase Realtime
   - Status should be "101 Switching Protocols"

4. **Trigger Location Update:**

   **Option A: Manual Database Update (Fastest)**
   ```sql
   -- Run in Supabase SQL Editor
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '[DEVICE_ID]';
   ```

   **Option B: Wait for GPS Sync (Natural)**
   - Wait up to 60 seconds for cron job to update

5. **Verify Console Logs:**
   After update, console should show:
   ```
   [Realtime] Position update received for [deviceId]: { event: 'UPDATE', ... }
   [Realtime] Mapped data: { deviceId, latitude, longitude, ... }
   [Realtime] ✅ Cache updated and invalidated for [deviceId]
   ```

6. **Verify UI Updates:**
   - ✅ Map marker moves instantly (< 1 second)
   - ✅ Coordinates display updates (if shown)
   - ✅ "Last updated" timestamp updates
   - ✅ No page refresh required

---

## ✅ Step 4: Error Scenarios

### Test Error Handling

1. **Subscription Error:**
   - If console shows: `[Realtime] ❌ Channel error`
   - **Fix:** Run `APPLY_REALTIME_FIX.sql`

2. **Missing Data Warning:**
   - If console shows: `[Realtime] Payload missing location data`
   - **Fix:** Run `ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;`

3. **No Updates Received:**
   - Check: Database update actually changed lat/lon
   - Check: device_id matches subscribed device
   - Check: WebSocket connection is active

---

## ✅ Step 5: Performance Verification

### Before Fix (Expected):
- Location updates: ~15-60 seconds delay (polling interval)
- Requires manual refresh to see updates

### After Fix (Expected):
- Location updates: < 1 second (realtime push)
- Automatic updates without refresh

### Measure:
1. Note time when database update occurs
2. Note time when map updates
3. Calculate difference (should be < 1 second)

---

## 📋 Success Criteria Checklist

- [ ] Database: `vehicle_positions` in `supabase_realtime` publication
- [ ] Database: REPLICA IDENTITY is FULL
- [ ] Database: Table has primary key
- [ ] Browser: Console shows successful subscription
- [ ] Browser: WebSocket connection active (Network tab)
- [ ] Browser: Location updates trigger console logs
- [ ] Browser: Map marker updates instantly (< 1 second)
- [ ] Browser: No page refresh required
- [ ] Browser: Multiple tabs update simultaneously (optional test)
- [ ] Browser: Subscription reconnects after page refresh (optional test)

---

## 🐛 Troubleshooting

### Issue: "Table not found in publication"
**Solution:** 
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
```

### Issue: "Subscription failed" or "CHANNEL_ERROR"
**Solution:**
1. Verify SQL fix applied (run VERIFY_REALTIME_FIX.sql)
2. Check Supabase project URL is correct
3. Check network tab for WebSocket connection errors
4. Verify RLS policies allow read access

### Issue: "Updates not received"
**Solution:**
1. Verify REPLICA IDENTITY is FULL
2. Check that lat/lon actually changed in database
3. Verify device_id matches subscribed device
4. Check console for any error messages

### Issue: "Map doesn't update"
**Solution:**
1. Check React component re-renders (React DevTools)
2. Verify `useRealtimeVehicleUpdates` hook is called
3. Check for JavaScript errors in console
4. Verify `mapToVehicleLiveData` function works correctly

---

## 📊 Test Results Template

```
Date: ___________
Tester: ___________

Database Configuration:
[ ] vehicle_positions in realtime publication
[ ] REPLICA IDENTITY = FULL
[ ] Primary key exists

Browser Test:
[ ] Subscription successful
[ ] WebSocket connected
[ ] Location update received
[ ] Map updated instantly
[ ] No refresh needed

Performance:
Update latency: _____ seconds (should be < 1)

Issues Found:
_______________________________________________

Status: ✅ PASS / ❌ FAIL
```

---

## ✅ Final Verification

Once all checks pass:

**Status:** ✅ **REALTIME LOCATION UPDATES WORKING**

The vehicle profile page now receives location updates in real-time without requiring page refreshes.

---

## 📝 Next Steps (If Issues Found)

1. Run `APPLY_REALTIME_FIX.sql` if database config is missing
2. Check browser console for specific error messages
3. Verify Supabase project settings
4. Test with different device IDs
5. Check network connectivity
