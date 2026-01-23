# Cursor AI Prompt: Fix and Test Realtime Vehicle Location Updates

## Context
The vehicle profile page is not showing realtime location updates. The root cause has been identified: the database realtime publication is not properly configured for the `vehicle_positions` table. The code implementation is correct, but the database configuration is missing.

## Your Task
Apply the database fix and verify that realtime location updates are working correctly.

---

## Step 1: Apply Database Fix

### Instructions:
1. Open the Supabase Dashboard SQL Editor for this project
2. Run the SQL script from `APPLY_REALTIME_FIX.sql` (located in the project root)
3. Alternatively, run this SQL directly:

```sql
-- Enable Realtime for vehicle_positions table
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;

-- Set REPLICA IDENTITY to FULL (required for UPDATE/DELETE events)
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
```

### Expected Result:
- ✅ No errors returned
- ✅ Success message: "ALTER PUBLICATION" and "ALTER TABLE" completed

---

## Step 2: Verify Database Configuration

### Instructions:
Run this verification query in Supabase SQL Editor:

```sql
-- Check if vehicle_positions is in the realtime publication
SELECT 
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'vehicle_positions';
```

### Expected Result:
- ✅ Returns 1 row with `tablename = 'vehicle_positions'` and `pubname = 'supabase_realtime'`

### Also verify REPLICA IDENTITY:

```sql
-- Check REPLICA IDENTITY setting
SELECT 
  schemaname,
  tablename,
  relreplident
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE tablename = 'vehicle_positions';
```

### Expected Result:
- ✅ `relreplident = 'f'` (FULL) or `relreplident = 'd'` (DEFAULT with primary key)

---

## Step 3: Test Realtime Subscription in Browser

### Instructions:
1. Start the development server (if not running):
   ```bash
   npm run dev
   ```

2. Navigate to a vehicle profile page:
   - Open browser to: `http://localhost:5173/owner/vehicle/[DEVICE_ID]`
   - Replace `[DEVICE_ID]` with an actual device ID from your database
   - Note: Route is `/owner/vehicle/:deviceId` (singular "vehicle")

3. Open browser DevTools (F12) → Console tab

4. Look for these log messages:
   - `[Realtime] ✅ Successfully subscribed to vehicle_positions updates for [deviceId]`
   - `[Realtime] 📡 Subscription status for [deviceId]: SUBSCRIBED`
   - `[Realtime] 🎯 Waiting for position updates...`

### Expected Result:
- ✅ Console shows successful subscription messages
- ✅ No error messages related to realtime
- ✅ WebSocket connection established (check Network tab → WS)

---

## Step 4: Trigger a Location Update

### Option A: Wait for GPS Sync (Natural Update)
- Wait up to 60 seconds for the GPS sync cron job to update `vehicle_positions`
- Monitor console for: `[Realtime] Position update received for [deviceId]:`

### Option B: Manual Database Update (Faster Testing)
Run this SQL in Supabase SQL Editor (replace `[DEVICE_ID]`):

```sql
-- Manually trigger an update to test realtime
UPDATE vehicle_positions 
SET 
  latitude = latitude + 0.0001,
  longitude = longitude + 0.0001,
  cached_at = NOW()
WHERE device_id = '[DEVICE_ID]';
```

### Expected Result:
- ✅ Console shows: `[Realtime] Position update received for [deviceId]:`
- ✅ Console shows: `[Realtime] Mapped data:` with location coordinates
- ✅ Console shows: `[Realtime] ✅ Cache updated and invalidated for [deviceId]`
- ✅ Map marker moves instantly (within 1 second)
- ✅ No page refresh required

---

## Step 5: Verify UI Updates

### Instructions:
1. Keep the vehicle profile page open
2. Watch the map component
3. Trigger an update (Step 4)

### Expected Result:
- ✅ Map marker position updates immediately
- ✅ Coordinates display updates (if shown)
- ✅ "Last updated" timestamp updates
- ✅ No page reload or manual refresh needed

---

## Step 6: Test Multiple Scenarios

### Test Case 1: Moving Vehicle
- Update `vehicle_positions` with significant lat/lon changes
- Verify map marker moves smoothly

### Test Case 2: Stationary Vehicle
- Update `vehicle_positions` with same lat/lon but new `cached_at`
- Verify timestamp updates but marker doesn't move

### Test Case 3: Multiple Browser Tabs
- Open same vehicle profile in 2+ tabs
- Update database once
- Verify all tabs update simultaneously

### Test Case 4: Page Refresh
- Refresh the vehicle profile page
- Verify subscription reconnects automatically
- Verify location loads correctly

---

## Step 7: Performance Verification

### Before Fix (Expected):
- Location updates: ~15 seconds delay (polling interval)
- Requires manual refresh to see updates

### After Fix (Expected):
- Location updates: < 1 second (realtime push)
- Automatic updates without refresh

### Measure:
1. Note the time when database update occurs
2. Note the time when map updates
3. Calculate difference (should be < 1 second)

---

## Success Criteria Checklist

- [ ] Database fix applied successfully (no errors)
- [ ] `vehicle_positions` confirmed in `supabase_realtime` publication
- [ ] REPLICA IDENTITY set to FULL
- [ ] Browser console shows successful subscription
- [ ] WebSocket connection active (Network tab)
- [ ] Location updates trigger console logs
- [ ] Map marker updates instantly (< 1 second)
- [ ] No page refresh required
- [ ] Multiple tabs update simultaneously
- [ ] Subscription reconnects after page refresh

---

## Troubleshooting

### Issue: "Table not found in publication"
**Solution:** Re-run Step 1 SQL commands

### Issue: "Subscription failed"
**Solution:** 
- Check browser console for specific error
- Verify Supabase project URL is correct
- Check network tab for WebSocket connection

### Issue: "Updates not received"
**Solution:**
- Verify REPLICA IDENTITY is FULL
- Check that `cached_at` or lat/lon actually changed
- Verify device_id matches subscribed device

### Issue: "Map doesn't update"
**Solution:**
- Check React component re-renders (React DevTools)
- Verify `useRealtimeVehicleUpdates` hook is called
- Check for JavaScript errors in console

---

## Completion

Once all success criteria are met, document the results:

1. ✅ Database configuration verified
2. ✅ Realtime subscription working
3. ✅ Location updates received in < 1 second
4. ✅ UI updates automatically
5. ✅ All test scenarios passed

**Status:** ✅ **REALTIME LOCATION UPDATES WORKING**

---

## Next Steps (Optional)

- Monitor production for realtime performance
- Add error boundaries for subscription failures
- Implement reconnection logic if needed
- Add loading states during initial subscription
