# Test Realtime Updates in Browser - Device 358657105966092

## 🚀 Quick Start Guide

### Step 1: Start Development Server

**Open terminal and run:**
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm run dev
```

**Wait for:** Server to start (usually shows "Local: http://localhost:5173")

---

### Step 2: Open Vehicle Profile Page

**Navigate to:**
```
http://localhost:5173/owner/vehicle/358657105966092
```

**Or click this link:** [Open Vehicle Profile](http://localhost:5173/owner/vehicle/358657105966092)

---

### Step 3: Open Browser Console

**Press F12** (or Right-click → Inspect → Console tab)

**Look for these messages:**
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
[Realtime] 📡 Subscription status for 358657105966092: SUBSCRIBED
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
[Realtime] 🎯 Waiting for position updates...
```

**✅ If you see these:** Subscription is working!

---

### Step 4: Check WebSocket Connection

1. Go to **Network** tab (still in DevTools)
2. Filter by **"WS"** (WebSocket)
3. Should see WebSocket connection to Supabase Realtime
4. Status should be **"101 Switching Protocols"**

**✅ If you see WebSocket:** Connection is active!

---

### Step 5: Test Realtime Update

**While page is open and console visible:**

1. **Open Supabase SQL Editor** (in another tab/window)
2. **Run this SQL:**
   ```sql
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '358657105966092';
   ```

3. **Watch browser console immediately** (within 1 second)

**Expected Console Output:**
```
[Realtime] Position update received for 358657105966092: {
  event: 'UPDATE',
  new: { device_id: '358657105966092', latitude: 9.067484, longitude: 7.431622, ... },
  old: { device_id: '358657105966092', latitude: 9.067384, longitude: 7.431522, ... },
  timestamp: '2026-01-23T...'
}
[Realtime] Mapped data: {
  deviceId: '358657105966092',
  latitude: 9.067484,
  longitude: 7.431622,
  lastUpdate: '...',
  speed: 0
}
[Realtime] ✅ Cache updated and invalidated for 358657105966092
```

4. **Check Map:**
   - ✅ Map marker should move instantly (< 1 second)
   - ✅ Coordinates display should update
   - ✅ "Last updated" timestamp should refresh
   - ✅ **No page refresh needed**

---

## ✅ Success Indicators

### Console Messages:
- ✅ `[Realtime] ✅ Successfully subscribed`
- ✅ `[Realtime] Position update received` (when SQL runs)
- ✅ `[Realtime] ✅ Cache updated and invalidated`

### Visual Indicators:
- ✅ Map marker moves when DB updates
- ✅ Coordinates display updates
- ✅ "Last updated" timestamp refreshes
- ✅ No page refresh needed

### Performance:
- ✅ Update latency: < 1 second
- ✅ Updates happen automatically
- ✅ No manual refresh required

---

## 🐛 Troubleshooting

### Issue: Page won't load
**Check:**
- Is dev server running? (`npm run dev`)
- Is port 5173 available?
- Check terminal for errors

### Issue: No console messages
**Check:**
- Is console filter hiding messages?
- Check "All levels" or "Verbose"
- Look for `[Realtime]` prefix

### Issue: "CHANNEL_ERROR" in console
**Check:**
- Run `VERIFY_REALTIME_FIX.sql` in Supabase
- Verify table is in realtime publication
- Check RLS policies

### Issue: Subscription works but no updates
**Check:**
- Is WebSocket connected? (Network tab)
- Run SQL update while page is open
- Check console for any errors

### Issue: Updates received but map doesn't move
**Check:**
- React DevTools → Check component re-renders
- Console for JavaScript errors
- Verify `useVehicleLiveData` hook

---

## 📋 Test Checklist

- [ ] Dev server running (`npm run dev`)
- [ ] Page loads: `http://localhost:5173/owner/vehicle/358657105966092`
- [ ] Console shows "Successfully subscribed"
- [ ] WebSocket connection active
- [ ] SQL update triggers console message
- [ ] Map marker moves instantly
- [ ] No page refresh needed

---

## 🎯 Expected Result

**When SQL UPDATE runs:**
1. Database updates immediately
2. Realtime pushes to browser (< 1 second)
3. Console shows update message
4. Map marker moves instantly
5. No page refresh needed

**If all steps pass:** ✅ **REALTIME IS WORKING!**

---

## 📝 Quick Test Sequence

1. **Start:** `npm run dev`
2. **Open:** `http://localhost:5173/owner/vehicle/358657105966092`
3. **Check:** Console for subscription success
4. **Run SQL:** Update query above
5. **Verify:** Console shows update + map moves

**Total time:** ~2 minutes

---

**Follow these steps and report what you see in the console!** 🎯
