# Quick Test Steps - Device 358657105966092

## 🎯 Simple 4-Step Test

### 1️⃣ Start Server
```bash
npm run dev
```
**Wait for:** "Local: http://localhost:5173" message

---

### 2️⃣ Open Page
**Browser:** `http://localhost:5173/owner/vehicle/358657105966092`

---

### 3️⃣ Check Console (F12)
**Look for:**
```
[Realtime] ✅ Successfully subscribed to vehicle_positions updates for 358657105966092
```

---

### 4️⃣ Test Update
**Run SQL (while page is open):**
```sql
UPDATE vehicle_positions 
SET latitude = latitude + 0.0001, cached_at = NOW()
WHERE device_id = '358657105966092';
```

**Watch console:** Should see `[Realtime] Position update received` immediately

**Check map:** Marker should move instantly

---

## ✅ If Map Moves Instantly = REALTIME WORKING! 🎉

---

**That's it! Follow these 4 steps.** 🚀
