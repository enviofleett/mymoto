# Debug: Realtime Updates Not Showing on Vehicle Profile Page

## 🔍 Issue
Database update occurred but vehicle profile page didn't update automatically.

---

## Step 1: Check Browser Console

### Open Console (F12 → Console tab)

**Look for these messages:**

### ✅ Good Signs (Subscription Working):
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
[Realtime] 📡 Subscription status for 358657105966092: SUBSCRIBED
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
[Realtime] 🎯 Waiting for position updates...
```

### ❌ Bad Signs (Subscription Failed):
```
[Realtime] ❌ Channel error for 358657105966092
[Realtime] ⚠️ Subscription timed out
[Realtime] ⚠️ Subscription closed
```

**What do you see?** Note the exact messages.

---

## Step 2: Check WebSocket Connection

### Network Tab Check:
1. Open **DevTools → Network tab**
2. Filter by **"WS"** (WebSocket)
3. Look for WebSocket connection to Supabase

**What to check:**
- ✅ WebSocket connection exists?
- ✅ Status is "101 Switching Protocols"?
- ❌ Connection failed or closed?
- ❌ No WebSocket connection at all?

---

## Step 3: Check for Errors

### Console Errors:
Look for any **red error messages** in console:
- JavaScript errors?
- Network errors?
- Supabase connection errors?
- RLS policy errors?

**Note any errors you see.**

---

## Step 4: Verify Hook is Called

### Check Component:
**File:** `src/pages/owner/OwnerVehicleProfile/index.tsx`

**Verify:**
- Hook is imported: `import { useRealtimeVehicleUpdates } from "@/hooks/useRealtimeVehicleUpdates";`
- Hook is called: `useRealtimeVehicleUpdates(deviceId);`
- `deviceId` is not null/undefined

**Check console for:**
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
```

**If you DON'T see this:** Hook might not be called or deviceId is null.

---

## Step 5: Test with Page Open

### While Page is Open:

1. **Keep page open:** `http://localhost:5173/owner/vehicle/358657105966092`
2. **Keep console open:** Watch for messages
3. **Run SQL update:**
   ```sql
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '358657105966092';
   ```
4. **Watch console immediately:** Do you see update message?

**Expected:** Should see `[Realtime] Position update received` within 1 second

**If you DON'T see it:** Subscription might not be active or WebSocket disconnected.

---

## Step 6: Check RLS Policies

### Verify RLS Allows Read Access:

```sql
-- Check RLS policies on vehicle_positions
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'vehicle_positions';
```

**Expected:** Should have policies allowing SELECT for authenticated users

**If no policies or restrictive:** RLS might be blocking realtime updates

---

## Step 7: Check Device ID Format

### Verify deviceId matches exactly:

```sql
-- Check exact device_id format
SELECT device_id, LENGTH(device_id) as id_length
FROM vehicle_positions
WHERE device_id = '358657105966092';
```

**Check console:** Does the deviceId in console match exactly?

**Common issues:**
- Extra spaces
- Different case
- Trailing/leading characters

---

## 🐛 Common Issues & Fixes

### Issue 1: "CHANNEL_ERROR" in Console
**Cause:** Table not in realtime publication or RLS blocking

**Fix:**
```sql
-- Verify table is in publication
SELECT tablename FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'vehicle_positions';

-- If missing, add it (should already be done)
ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
```

### Issue 2: No Console Messages at All
**Cause:** Hook not being called or deviceId is null

**Fix:**
- Check `OwnerVehicleProfile` component
- Verify `deviceId` from URL params is not null
- Check console for any React errors

### Issue 3: Subscription Shows but No Updates
**Cause:** WebSocket disconnected or RLS blocking

**Fix:**
- Check Network tab for WebSocket status
- Verify RLS policies allow SELECT
- Try refreshing page to reconnect

### Issue 4: Updates Received but Map Doesn't Move
**Cause:** React component not re-rendering or cache issue

**Fix:**
- Check React DevTools → Components → Verify re-renders
- Check console for JavaScript errors
- Verify `useVehicleLiveData` hook is working

---

## 📋 Diagnostic Checklist

**Run through this checklist:**

- [ ] Page URL is correct: `/owner/vehicle/358657105966092`
- [ ] Console shows "Setting up subscription"
- [ ] Console shows "Successfully subscribed"
- [ ] WebSocket connection exists in Network tab
- [ ] WebSocket status is "101 Switching Protocols"
- [ ] No JavaScript errors in console
- [ ] No network errors
- [ ] Device ID matches exactly (no spaces, correct format)
- [ ] RLS policies allow SELECT
- [ ] Table is in realtime publication
- [ ] REPLICA IDENTITY is FULL

---

## 🔧 Quick Fixes to Try

### Fix 1: Refresh Page
- Close and reopen the vehicle profile page
- Watch console for subscription messages
- Try SQL update again

### Fix 2: Check Supabase Connection
- Verify `.env` file has correct Supabase URL
- Check if other Supabase features work (auth, queries)
- Verify network connectivity

### Fix 3: Clear Browser Cache
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Clear browser cache
- Try again

### Fix 4: Check Browser Console Filter
- Make sure console filter isn't hiding messages
- Check "All levels" or "Verbose" is enabled
- Look for messages with `[Realtime]` prefix

---

## 📝 Report What You See

**Please check and report:**

1. **Console Messages:**
   - Do you see "Setting up subscription"?
   - Do you see "Successfully subscribed"?
   - Do you see "Position update received" when SQL runs?
   - Any error messages?

2. **Network Tab:**
   - Is WebSocket connection present?
   - What is the status?
   - Any failed requests?

3. **Page Behavior:**
   - Does page load correctly?
   - Does map show current location?
   - Any visual errors?

4. **When SQL Runs:**
   - Does console show update message?
   - Does map marker move?
   - How long does it take?

---

## 🎯 Next Steps

Based on what you find:

1. **If subscription fails:** Check RLS policies and realtime configuration
2. **If subscription works but no updates:** Check WebSocket connection
3. **If updates received but map doesn't move:** Check React component rendering
4. **If nothing works:** Check for JavaScript errors blocking execution

**Share what you see in the console and we'll fix it!** 🔧
