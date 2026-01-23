# Open and Test Realtime Updates - Quick Guide

## 🚀 Step 1: Start Development Server

**In Terminal, run:**
```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
npm run dev
```

**Wait for:** Server to start (shows "Local: http://localhost:5173")

---

## 🌐 Step 2: Open Vehicle Profile Page

**Once server is running, open in browser:**
```
http://localhost:5173/owner/vehicle/358657105966092
```

**Or use this direct link:**
- Click: [http://localhost:5173/owner/vehicle/358657105966092](http://localhost:5173/owner/vehicle/358657105966092)

---

## 🔍 Step 3: Check Console

**Press F12** → **Console** tab

**Look for:**
```
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
```

**✅ If you see this:** Subscription is working!

---

## 🧪 Step 4: Test Update

**While page is open:**

1. **Open Supabase SQL Editor** (in another tab)
2. **Run this SQL:**
   ```sql
   UPDATE vehicle_positions 
   SET 
     latitude = latitude + 0.0001,
     longitude = longitude + 0.0001,
     cached_at = NOW()
   WHERE device_id = '358657105966092';
   ```

3. **Watch browser console** (should see update within 1 second)

**Expected:**
- Console: `[Realtime] Position update received`
- Map: Marker moves instantly
- No refresh needed

---

## ✅ Success = Realtime Working!

**If map updates instantly:** ✅ **REALTIME IS WORKING!**

---

## 📋 Quick Checklist

- [ ] Server running (`npm run dev`)
- [ ] Page opened: `/owner/vehicle/358657105966092`
- [ ] Console shows "Successfully subscribed"
- [ ] SQL update triggers console message
- [ ] Map marker moves instantly

---

**That's it! Follow these 4 steps to test.** 🎯
