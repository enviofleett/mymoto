# Testing Guide - Post-Deployment Verification

**Date:** 2026-01-21  
**Status:** ✅ Functions Deployed - Ready for Testing

---

## ✅ Deployment Confirmed

Both functions are deployed and accessible:
- ✅ `sync-trips-incremental` - Responding
- ✅ `reconcile-gps51-data` - Responding

---

## 🧪 Test Plan

### Test 1: Vehicle Assignment Fix

**Objective:** Verify no 400 errors when assigning vehicles

**Steps:**
1. Open your PWA application
2. Navigate to **Admin Panel → User Management**
3. **Create a new user** OR **Edit an existing user**
4. **Assign vehicles** to the user
5. **Verify:** No 400 Bad Request errors in browser console
6. **Check:** Vehicles appear in user's assignment list

**Expected Result:** ✅ No errors, assignments work smoothly

---

### Test 2: Single Device Trip Sync (30-Day History)

**Objective:** Verify new sync fetches 30 days of history

**Command:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["RBC784CX"],
    "force_full_sync": true
  }'
```

**Replace:**
- `YOUR_SERVICE_ROLE_KEY` with your actual service role key
- `RBC784CX` with a test device ID

**Expected Response:**
```json
{
  "success": true,
  "devices_processed": 1,
  "trips_created": <number>,
  "trips_skipped": <number>,
  "device_results": {
    "RBC784CX": {
      "trips": <number>,
      "skipped": <number>,
      "total_from_gps51": <number>
    }
  },
  "duration_ms": <number>,
  "sync_type": "full"
}
```

**Verify in SQL Editor:**
```sql
-- Check if 30-day history was fetched
SELECT 
  device_id,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip,
  COUNT(*) as trip_count,
  CASE 
    WHEN MIN(start_time) < NOW() - INTERVAL '25 days' THEN '✅ 30+ days coverage'
    WHEN MIN(start_time) < NOW() - INTERVAL '20 days' THEN '⚠️ 20-25 days coverage'
    ELSE '❌ Less than 20 days'
  END as coverage_status
FROM vehicle_trips
WHERE device_id = 'RBC784CX'
  AND created_at >= NOW() - INTERVAL '10 minutes'
GROUP BY device_id;
```

**Expected Result:** ✅ Shows "30+ days coverage"

---

### Test 3: Coordinate Backfilling (Before Reconciliation)

**Objective:** Check current coordinate completeness

**SQL Query:**
```sql
-- Check coordinate completeness BEFORE reconciliation
SELECT 
  device_id,
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = 'RBC784CX'
GROUP BY device_id;
```

**Note the `completeness_percent`** - we'll compare after reconciliation.

---

### Test 4: Run Reconciliation on Single Device

**Objective:** Verify coordinate backfilling works

**Command:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "coordinates",
    "deviceId": "RBC784CX",
    "startDate": "2026-01-01",
    "endDate": "2026-01-21"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mode": "coordinates",
  "deviceId": "RBC784CX",
  "dateRange": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-21T00:00:00.000Z"
  },
  "results": {
    "tripsFixed": <number>,
    "tripsChecked": <number>,
    "coordinatesBackfilled": <number>,
    "errors": []
  },
  "duration_ms": <number>
}
```

**Verify Improvement:**
```sql
-- Check coordinate completeness AFTER reconciliation
SELECT 
  device_id,
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = 'RBC784CX'
GROUP BY device_id;
```

**Expected Result:** ✅ `completeness_percent` should increase (target: 90-95%)

---

### Test 5: Verify Travel Time Accuracy

**Objective:** Confirm travel time matches GPS51 representation

**SQL Query:**
```sql
-- Check travel time (duration) calculation
SELECT 
  device_id,
  start_time,
  end_time,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) as calculated_duration_seconds,
  CASE 
    WHEN ABS(duration_seconds - EXTRACT(EPOCH FROM (end_time - start_time))) < 1 THEN '✅ Matches'
    ELSE '❌ Mismatch'
  END as duration_check
FROM vehicle_trips
WHERE device_id = 'RBC784CX'
  AND created_at >= NOW() - INTERVAL '1 day'
ORDER BY start_time DESC
LIMIT 10;
```

**Expected Result:** ✅ All rows show "Matches" (duration = end_time - start_time)

---

### Test 6: Verify Distance Accuracy

**Objective:** Confirm distance uses GPS51 accumulated path distance

**SQL Query:**
```sql
-- Check distance values (should be from GPS51, not recalculated)
SELECT 
  device_id,
  start_time,
  end_time,
  distance_km,
  -- Calculate straight-line distance for comparison
  ROUND(
    6371 * acos(
      cos(radians(start_latitude)) * 
      cos(radians(end_latitude)) * 
      cos(radians(end_longitude) - radians(start_longitude)) + 
      sin(radians(start_latitude)) * 
      sin(radians(end_latitude))
    )::numeric, 
    2
  ) as straight_line_distance_km,
  CASE 
    WHEN distance_km > 0 AND start_latitude != 0 AND end_latitude != 0 THEN
      CASE 
        WHEN distance_km >= straight_line_distance_km * 1.2 THEN '✅ GPS51 path distance (longer than straight-line)'
        WHEN distance_km >= straight_line_distance_km * 0.95 THEN '⚠️ Close to straight-line (may be fallback)'
        ELSE '❌ Less than straight-line (error)'
      END
    ELSE 'N/A'
  END as distance_check
FROM vehicle_trips
WHERE device_id = 'RBC784CX'
  AND start_latitude != 0 
  AND end_latitude != 0
  AND created_at >= NOW() - INTERVAL '1 day'
ORDER BY start_time DESC
LIMIT 10;
```

**Expected Result:** ✅ Most trips show "GPS51 path distance" (distance > straight-line)

---

## 📊 Overall Health Check

### Check Overall Coordinate Completeness

```sql
-- Overall health metrics
SELECT 
  COUNT(*) as total_trips,
  COUNT(DISTINCT device_id) as devices_with_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  ROUND(AVG(duration_seconds)::numeric / 60, 2) as avg_duration_minutes,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Target Metrics:**
- ✅ Completeness: 90-95% (up from 76.44%)
- ✅ Average distance: Should be reasonable (not 0)
- ✅ Average duration: Should be reasonable (not 0)

---

## 🎯 Success Criteria

### ✅ All Tests Pass When:

1. **Vehicle Assignment:**
   - [ ] No 400 errors when assigning vehicles
   - [ ] Assignments appear correctly in UI

2. **Trip Sync:**
   - [ ] Sync completes successfully
   - [ ] 30-day history is fetched for new devices
   - [ ] Trips are stored with correct data

3. **Coordinate Backfilling:**
   - [ ] Reconciliation completes without errors
   - [ ] Coordinate completeness improves to 90%+
   - [ ] Trips have valid coordinates after reconciliation

4. **Data Accuracy:**
   - [ ] Travel time matches GPS51 (end_time - start_time)
   - [ ] Distance uses GPS51 accumulated path (not straight-line)
   - [ ] Coordinates are valid (not 0,0)

---

## 🚨 Troubleshooting

### Reconciliation Shows 0 Trips Fixed

**Possible Causes:**
1. No trips with missing coordinates in date range
2. `position_history` doesn't have data for the time period
3. Date range doesn't include trips with (0,0) coordinates

**Check:**
```sql
-- Check if there are trips needing backfill
SELECT COUNT(*) as trips_needing_backfill
FROM vehicle_trips
WHERE (start_latitude = 0 OR end_latitude = 0)
  AND start_time >= '2026-01-01'
  AND start_time <= '2026-01-21';

-- Check if position_history has data
SELECT COUNT(*) as position_points
FROM position_history
WHERE gps_time >= '2026-01-01'
  AND gps_time <= '2026-01-21';
```

### Sync Shows 0 Trips Created

**Possible Causes:**
1. Device has no trips in GPS51 for the date range
2. All trips are duplicates (already exist)
3. GPS51 API returned no trips

**Check:**
- Review function logs in Supabase Dashboard
- Verify device ID is correct
- Check GPS51 API response

### Coordinate Completeness Not Improving

**Possible Causes:**
1. `position_history` doesn't have data near trip times
2. Backfill window (±15 min) is too narrow
3. Trips don't have corresponding position_history entries

**Check:**
```sql
-- Check position_history coverage
SELECT 
  device_id,
  MIN(gps_time) as earliest_position,
  MAX(gps_time) as latest_position,
  COUNT(*) as total_positions
FROM position_history
WHERE device_id = 'RBC784CX'
GROUP BY device_id;
```

---

## 📝 Next Steps After Testing

1. **If all tests pass:** Proceed to full reconciliation (all devices)
2. **If issues found:** Review logs and troubleshoot
3. **Monitor:** Set up daily monitoring queries

---

## ✅ Ready to Test?

Start with **Test 1** (Vehicle Assignment) - it's the quickest and confirms the frontend fix works.

Then proceed through Tests 2-6 to verify all GPS51 fixes are working correctly.
