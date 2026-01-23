# Manual Test Guide - Realtime Updates

## 🚀 Start Development Server

**Terminal 1:**
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm run dev
```

**Wait for:** Server to show "Local: http://localhost:5173"

---

## 🌐 Open Vehicle Profile Page

**Browser:**
1. Open: `http://localhost:5173`
2. Login (if required)
3. Navigate to: `/owner/vehicle/358657105966092`

**Or direct URL:**
```
http://localhost:5173/owner/vehicle/358657105966092
```

---

## 🔍 Step 1: Check Console

**Press F12** → **Console** tab

**Expected Messages:**
```
[Realtime] 🔵 Setting up subscription for device: 358657105966092
[Realtime] 📡 Subscription status for 358657105966092: SUBSCRIBED
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
[Realtime] 🎯 Waiting for position updates...
```

**✅ If you see these:** Subscription is working!

**❌ If you DON'T see these:** Check for errors below

---

## 🌐 Step 2: Check WebSocket

**DevTools → Network tab → Filter "WS"**

**Expected:**
- WebSocket connection to Supabase Realtime
- Status: "101 Switching Protocols"

**✅ If you see WebSocket:** Connection is active!

---

## 🧪 Step 3: Test Update

**While page is open and console visible:**

1. **Open Supabase Dashboard** (in another tab)
2. **Go to SQL Editor**
3. **Run this SQL:**
   ```sql
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '358657105966092';
   ```

4. **Watch browser console immediately** (within 1-2 seconds)

**Expected Console Output:**
```
[Realtime] Position update received for 358657105966092: {
  event: 'UPDATE',
  new: { device_id: '358657105966092', latitude: 9.067484, ... },
  ...
}
[Realtime] Mapped data: { deviceId: '358657105966092', ... }
[Realtime] ✅ Cache updated and invalidated for 358657105966092
```

5. **Check Map:**
   - ✅ Map marker moves instantly (< 1 second)
   - ✅ Coordinates update
   - ✅ "Last updated" refreshes
   - ✅ **No page refresh needed**

---

## ✅ Success Criteria

**If you see:**
- ✅ Console: "Successfully subscribed"
- ✅ Console: "Position update received" (when SQL runs)
- ✅ Map: Marker moves instantly
- ✅ Performance: Update in < 1 second

**Then:** ✅ **REALTIME IS WORKING!**

---

## 🐛 Common Issues

### Issue: No console messages
**Check:**
- Console filter settings (show "All levels")
- Look for `[Realtime]` prefix
- Check for JavaScript errors

### Issue: "CHANNEL_ERROR"
**Fix:** Run `APPLY_REALTIME_FIX.sql` in Supabase

### Issue: Subscription works but no updates
**Check:**
- WebSocket connection status
- Run SQL update while page is open
- Check RLS policies

### Issue: Updates received but map doesn't move
**Check:**
- React DevTools → Component re-renders
- Console for JavaScript errors
- Verify no blocking errors

---

## 📋 Test Checklist

- [ ] Server running (`npm run dev`)
- [ ] Page loads successfully
- [ ] Console shows "Successfully subscribed"
- [ ] WebSocket connection active
- [ ] SQL update triggers console message
- [ ] Map marker moves instantly
- [ ] No page refresh needed

---

## 🎯 Expected Timeline

```
Time 0:00 - Run SQL UPDATE
Time 0:00 - Database updates
Time 0:00 - Realtime pushes to browser
Time 0:01 - Console shows "Position update received"
Time 0:01 - Map marker moves
```

**Total:** < 1 second from SQL to map update

---

**Follow these steps and report what you see!** 🎯
