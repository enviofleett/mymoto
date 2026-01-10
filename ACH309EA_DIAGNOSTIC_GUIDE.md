# ACH309EA Diagnostic Guide
## Step-by-Step Investigation for Missing Vehicle Data

**Vehicle ID:** ACH309EA
**Issue:** No data showing in Owner Vehicle Profile
**Date:** 2026-01-10

---

## 🔍 How to Run These Diagnostics

### Option 1: Supabase SQL Editor (Recommended)
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `fleet-flow`
3. Click **SQL Editor** in the left sidebar
4. Create a **New query**
5. Copy and paste each query below one at a time
6. Click **Run** and record the results

### Option 2: Supabase CLI (Advanced)
```bash
supabase db execute --file verify_ach309ea_data.sql
```

---

## 📋 Diagnostic Queries (Run in Order)

### Query 1: Check if Vehicle is Registered
```sql
SELECT
  device_id,
  device_name,
  latitude,
  longitude,
  speed,
  battery_percent,
  total_mileage,
  status,
  last_updated,
  created_at
FROM vehicles
WHERE device_id = 'ACH309EA';
```

**Expected Result:** 1 row with vehicle details

**If you see:**
- ✅ **1 row returned** → Vehicle is registered, proceed to Query 2
- ❌ **0 rows returned** → **ROOT CAUSE FOUND**: Vehicle not registered in system
  - **Action:** Vehicle needs to be synced from GPS51
  - Check `gps-data` Edge Function logs
  - Check if GPS51 API is returning this vehicle

---

### Query 2: Check Raw GPS Data Exists
```sql
SELECT
  count(*) as total_points,
  min(gps_time) as earliest_point,
  max(gps_time) as latest_point,
  count(DISTINCT DATE(gps_time)) as days_with_data,
  max(latitude) as sample_lat,
  max(longitude) as sample_lng
FROM position_history
WHERE device_id = 'ACH309EA';
```

**Expected Result:** `total_points > 0`

**If you see:**
- ✅ **total_points > 1000** → Good! GPS data is flowing, proceed to Query 3
- ⚠️ **total_points < 100** → Limited data, may be a new vehicle
- ❌ **total_points = 0** → **ROOT CAUSE FOUND**: No GPS data being received
  - **Action:** Check GPS51 sync
  - Verify `gps-data` Edge Function is running
  - Check if device is sending data to GPS51

---

### Query 3: Check if Trips are Calculated
```sql
SELECT
  count(*) as trip_count,
  round(sum(distance_km)::numeric, 2) as total_distance_km,
  min(start_time) as earliest_trip,
  max(start_time) as latest_trip,
  round(avg(distance_km)::numeric, 2) as avg_trip_distance,
  round(max(max_speed)::numeric, 1) as peak_speed_ever
FROM vehicle_trips
WHERE device_id = 'ACH309EA';
```

**Expected Result:** `trip_count > 0`

**If you see:**
- ✅ **trip_count > 10** → Good! Trips are being calculated, proceed to Query 4
- ❌ **trip_count = 0 BUT Query 2 had data** → **ROOT CAUSE FOUND**: Trip calculation not working
  - **Action:** Check trip detection algorithm
  - Verify `vehicle_trips` migration ran successfully
  - Check if ignition_on data is being captured

---

### Query 4: Check Daily Stats View
```sql
SELECT
  stat_date,
  trip_count,
  total_distance_km,
  avg_distance_km,
  peak_speed,
  avg_speed,
  total_duration_seconds,
  first_trip_start,
  last_trip_end
FROM vehicle_daily_stats
WHERE device_id = 'ACH309EA'
ORDER BY stat_date DESC
LIMIT 10;
```

**Expected Result:** 10 rows (last 10 days with activity)

**If you see:**
- ✅ **Multiple rows returned** → Stats are being calculated, proceed to Query 5
- ❌ **0 rows BUT Query 3 had trips** → **ROOT CAUSE FOUND**: View not working
  - **Action:** Recreate `vehicle_daily_stats` view
  - Run migration: `20260110154635_6d5ddd5d-6e8c-4239-8206-c4960fe26726.sql`

---

### Query 5: Check LLM Settings (Foreign Key Test)
```sql
SELECT
  device_id,
  nickname,
  language_preference,
  personality_mode,
  llm_enabled,
  avatar_url,
  created_at,
  updated_at
FROM vehicle_llm_settings
WHERE device_id = 'ACH309EA';
```

**Expected Result:** 0 or 1 row

**If you see:**
- ✅ **1 row** → Settings exist, no FK issue
- ⚠️ **0 rows** → No settings saved yet (normal for new vehicles)

---

### Query 6: Test RPC Functions
```sql
-- Test mileage stats RPC
SELECT * FROM get_vehicle_mileage_stats('ACH309EA') as stats;

-- Test daily mileage RPC
SELECT * FROM get_daily_mileage('ACH309EA') as daily;
```

**Expected Result:** JSON data with mileage stats

**If you see:**
- ✅ **JSON with stats** → RPC functions working
- ❌ **NULL or Error** → **ROOT CAUSE FOUND**: RPC function failing
  - **Action:** Check RPC function definitions
  - Verify functions exist: `\df get_vehicle_mileage_stats`
  - Check RLS policies on `vehicle_trips` table

---

### Query 7: Check Recent Position Updates
```sql
SELECT
  gps_time,
  latitude,
  longitude,
  speed,
  ignition_on,
  battery_percent,
  (NOW() - gps_time) as age
FROM position_history
WHERE device_id = 'ACH309EA'
ORDER BY gps_time DESC
LIMIT 5;
```

**Expected Result:** 5 recent GPS points

**If you see:**
- ✅ **Recent timestamps (< 1 hour old)** → Vehicle is actively reporting
- ⚠️ **Old timestamps (> 1 day old)** → Vehicle may be offline
- ❌ **No rows** → See Query 2 diagnosis

---

## 🔬 Additional Diagnostic: Check RLS Policies

### Query 8: Verify User Can Access This Vehicle
```sql
-- First, get current user ID
SELECT auth.uid() as current_user_id;

-- Then check if user has assignment to this vehicle
SELECT
  va.id,
  va.profile_id,
  va.device_id,
  va.role,
  p.user_id
FROM vehicle_assignments va
JOIN profiles p ON p.id = va.profile_id
WHERE va.device_id = 'ACH309EA'
  AND p.user_id = auth.uid();
```

**Expected Result:** 1 row showing assignment

**If you see:**
- ✅ **1 row** → User has access to this vehicle
- ❌ **0 rows** → **ROOT CAUSE FOUND**: User doesn't have assignment
  - **Action:** Create vehicle assignment
  - Check if user is the owner or has been assigned access

---

## 📊 Troubleshooting Decision Tree

```
START: ACH309EA shows no data in PWA
│
├─ Query 1: Vehicle in 'vehicles' table?
│  ├─ NO → Run gps-data sync → Manually add vehicle
│  └─ YES ↓
│
├─ Query 2: Raw GPS data exists?
│  ├─ NO → Check GPS51 connection → Verify device is sending data
│  └─ YES ↓
│
├─ Query 3: Trips calculated?
│  ├─ NO → Check trip algorithm → Verify ignition data → Run trip detection
│  └─ YES ↓
│
├─ Query 4: Daily stats view working?
│  ├─ NO → Recreate view → Re-run migration
│  └─ YES ↓
│
├─ Query 6: RPC functions working?
│  ├─ NO → Check RLS policies → Recreate functions
│  └─ YES ↓
│
└─ Query 8: User has access?
   ├─ NO → Create vehicle_assignment → Grant access
   └─ YES → Check frontend React Query cache → Clear browser cache

```

---

## 🛠️ Common Fixes

### Fix 1: Vehicle Not Registered
```sql
-- Manually register the vehicle
INSERT INTO vehicles (device_id, device_name)
VALUES ('ACH309EA', 'ACH309EA')
ON CONFLICT (device_id) DO NOTHING;
```

### Fix 2: Create Vehicle Assignment (if user has no access)
```sql
-- First, get the user's profile ID
-- Replace 'user-uuid-here' with actual user UUID
INSERT INTO vehicle_assignments (profile_id, device_id, role)
SELECT p.id, 'ACH309EA', 'owner'
FROM profiles p
WHERE p.user_id = 'user-uuid-here'
ON CONFLICT (profile_id, device_id) DO NOTHING;
```

### Fix 3: Manually Trigger Trip Calculation (if needed)
```sql
-- This depends on your trip detection logic
-- Check for the specific function or trigger you're using
SELECT * FROM detect_trips_for_vehicle('ACH309EA');
```

### Fix 4: Recreate Daily Stats View
```sql
-- Drop and recreate the view
DROP VIEW IF EXISTS vehicle_daily_stats;

-- Run the migration file:
-- supabase/migrations/20260110154635_6d5ddd5d-6e8c-4239-8206-c4960fe26726.sql
```

---

## 📝 Results Template

Use this template to record your findings:

```
=== ACH309EA DIAGNOSTIC RESULTS ===
Date: _____________
Tested By: _____________

Query 1 (Vehicle Registered): [ ] PASS / [ ] FAIL
  - Row count: _____
  - Notes: _________________________________

Query 2 (GPS Data Exists): [ ] PASS / [ ] FAIL
  - Total points: _____
  - Date range: __________ to __________
  - Notes: _________________________________

Query 3 (Trips Calculated): [ ] PASS / [ ] FAIL
  - Trip count: _____
  - Total distance: _____ km
  - Notes: _________________________________

Query 4 (Daily Stats): [ ] PASS / [ ] FAIL
  - Rows returned: _____
  - Notes: _________________________________

Query 5 (LLM Settings): [ ] PASS / [ ] FAIL
  - Settings exist: [ ] YES / [ ] NO
  - Notes: _________________________________

Query 6 (RPC Functions): [ ] PASS / [ ] FAIL
  - Result: _________________________________

Query 7 (Recent Updates): [ ] PASS / [ ] FAIL
  - Latest timestamp: __________
  - Notes: _________________________________

Query 8 (User Access): [ ] PASS / [ ] FAIL
  - Has assignment: [ ] YES / [ ] NO
  - Notes: _________________________________

=== ROOT CAUSE IDENTIFIED ===
Issue: _________________________________________
Fix Applied: ___________________________________
Verified: [ ] YES / [ ] NO
```

---

## 🚀 Next Steps After Diagnosis

Once you've run all queries and identified the root cause:

1. **Document the results** using the template above
2. **Apply the appropriate fix** from the "Common Fixes" section
3. **Re-run the diagnostic queries** to verify the fix
4. **Test in the PWA** - Open Owner Vehicle Profile for ACH309EA
5. **Report back** with findings

---

## 📞 Need Help?

If diagnostics reveal an unexpected issue:
1. Share the results template
2. Include any error messages from queries
3. Provide screenshots of the PWA showing the issue
4. Check Supabase Edge Function logs for `gps-data` function

---

**Good luck with the diagnostics! 🔍**
