# Test EPE511GA - Step by Step Guide

**IMPORTANT:** SQL queries go in SQL Editor, curl commands go in Terminal!

---

## 📝 STEP 1: Find Device ID (SQL Editor)

**Go to:** Supabase Dashboard → SQL Editor

**Copy and paste this SQL query:**

```sql
SELECT device_id, device_name, gps_owner
FROM vehicles
WHERE device_name = 'EPE511GA';
```

**Click:** "Run" button

**Result:** You'll see a row with a numeric `device_id` (like `13612330240`)

**Write down the `device_id` value** - you'll need it for Step 2.

---

## 💻 STEP 2: Test Sync (Terminal)

**Open:** Your terminal/command prompt (NOT SQL Editor!)

**Copy and paste this command** (replace `YOUR_DEVICE_ID` with the number from Step 1):

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs' \
  -H 'Content-Type: application/json' \
  -d '{"device_ids": ["YOUR_DEVICE_ID"], "force_full_sync": true}'
```

**Press:** Enter

**Expected Response:**
```json
{
  "success": true,
  "devices_processed": 1,
  "trips_created": <number>,
  "trips_skipped": <number>,
  "device_results": {
    "YOUR_DEVICE_ID": {
      "trips": <number>,
      "skipped": <number>,
      "total_from_gps51": <number>
    }
  }
}
```

---

## 📝 STEP 3: Verify Results (SQL Editor)

**Go back to:** Supabase Dashboard → SQL Editor

**Copy and paste this SQL query** (replace `YOUR_DEVICE_ID` with the number from Step 1):

```sql
SELECT 
  COUNT(*) as new_trips,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  CASE 
    WHEN MIN(start_time) < NOW() - INTERVAL '25 days' THEN '✅ 30+ days coverage'
    WHEN MIN(start_time) < NOW() - INTERVAL '20 days' THEN '⚠️ 20-25 days coverage'
    ELSE '❌ Less than 20 days'
  END as coverage_status
FROM vehicle_trips
WHERE device_id = 'YOUR_DEVICE_ID'
  AND created_at >= NOW() - INTERVAL '10 minutes';
```

**Click:** "Run" button

**Expected Result:** Shows trips were created and coverage status

---

## 🔄 STEP 4: Test Reconciliation (Terminal)

**Go back to:** Your terminal

**Copy and paste this command** (replace `YOUR_DEVICE_ID`):

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs' \
  -H 'Content-Type: application/json' \
  -d '{"mode": "coordinates", "deviceId": "YOUR_DEVICE_ID", "startDate": "2026-01-01", "endDate": "2026-01-21"}'
```

**Press:** Enter

---

## 📝 STEP 5: Check Coordinate Completeness (SQL Editor)

**Go back to:** Supabase Dashboard → SQL Editor

**Copy and paste this SQL query** (replace `YOUR_DEVICE_ID`):

```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = 'YOUR_DEVICE_ID';
```

**Click:** "Run" button

**Expected Result:** Shows completeness percentage (target: 90%+)

---

## ⚠️ REMEMBER:

- **SQL queries** → Run in **Supabase SQL Editor**
- **curl commands** → Run in **Your Terminal**

**Never mix them!**

---

## 🎯 Quick Checklist

- [ ] Step 1: Found device_id in SQL Editor
- [ ] Step 2: Ran sync command in Terminal
- [ ] Step 3: Verified results in SQL Editor
- [ ] Step 4: Ran reconciliation in Terminal
- [ ] Step 5: Checked completeness in SQL Editor

---

**Start with Step 1 in the SQL Editor!**
