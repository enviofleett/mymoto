# Quick Test Guide - EPE511GA

**Device Name:** EPE511GA  
**Status:** Ready to test

---

## Step 1: Find the Device ID (2 minutes)

**Run this SQL query in Supabase SQL Editor:**

```sql
-- Find device_id for EPE511GA
SELECT 
  device_id,
  device_name,
  gps_owner,
  last_synced_at
FROM vehicles
WHERE device_name = 'EPE511GA';
```

**Expected Result:** You'll get a row with a numeric `device_id` (like `13612330240`)

**Note the `device_id` value** - you'll need it for the sync command.

---

## Step 2: Test Trip Sync (5 minutes)

**Replace `DEVICE_ID_FROM_STEP1` with the numeric device_id you found:**

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["DEVICE_ID_FROM_STEP1"],
    "force_full_sync": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "devices_processed": 1,
  "trips_created": <number>,
  "trips_skipped": <number>,
  "device_results": {
    "DEVICE_ID": {
      "trips": <number>,
      "skipped": <number>,
      "total_from_gps51": <number>
    }
  },
  "duration_ms": <number>,
  "sync_type": "full"
}
```

**✅ Success Indicators:**
- `total_from_gps51 > 0` - GPS51 returned trips
- `trips_created > 0` - New trips were added
- `sync_type: "full"` - 30-day history was fetched

---

## Step 3: Verify 30-Day History (2 minutes)

**Run this SQL query to verify 30-day coverage:**

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
WHERE device_id = 'DEVICE_ID_FROM_STEP1'
  AND created_at >= NOW() - INTERVAL '10 minutes'
GROUP BY device_id;
```

**Expected Result:** ✅ Shows "30+ days coverage"

---

## Step 4: Test Coordinate Backfilling (5 minutes)

**Before reconciliation - check current completeness:**

```sql
-- Check coordinate completeness BEFORE
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = 'DEVICE_ID_FROM_STEP1';
```

**Run reconciliation:**

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "coordinates",
    "deviceId": "DEVICE_ID_FROM_STEP1",
    "startDate": "2026-01-01",
    "endDate": "2026-01-21"
  }'
```

**After reconciliation - check improvement:**

```sql
-- Check coordinate completeness AFTER
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE device_id = 'DEVICE_ID_FROM_STEP1';
```

**Expected Result:** ✅ `completeness_percent` should increase (target: 90%+)

---

## Step 5: Verify Travel Time Accuracy

**Check that duration matches GPS51 representation:**

```sql
-- Verify travel time calculation
SELECT 
  start_time,
  end_time,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) as calculated_duration_seconds,
  CASE 
    WHEN ABS(duration_seconds - EXTRACT(EPOCH FROM (end_time - start_time))) < 1 THEN '✅ Matches GPS51'
    ELSE '❌ Mismatch'
  END as duration_check
FROM vehicle_trips
WHERE device_id = 'DEVICE_ID_FROM_STEP1'
  AND created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY start_time DESC
LIMIT 10;
```

**Expected Result:** ✅ All rows show "Matches GPS51"

---

## 🎯 Success Criteria

### ✅ Test Passes When:

1. **Sync Returns Trips:**
   - [ ] `total_from_gps51 > 0`
   - [ ] `trips_created > 0` OR `trips_skipped > 0`

2. **30-Day History:**
   - [ ] Coverage status shows "✅ 30+ days coverage"
   - [ ] Earliest trip is 25+ days ago

3. **Coordinate Backfilling:**
   - [ ] Reconciliation completes successfully
   - [ ] `tripsFixed > 0` OR completeness improves

4. **Travel Time:**
   - [ ] All duration checks show "✅ Matches GPS51"

---

## 🚨 Troubleshooting

### If sync returns 0 trips:
1. **Check device_id format** - Must be numeric (GPS51 format)
2. **Check GPS51 token** - Verify it's valid and not expired
3. **Check Edge Function logs** - Look for GPS51 API errors
4. **Try a different device** - Some devices may not have trips

### If 30-day coverage not achieved:
1. **Check GPS51** - Device might not have 30 days of history
2. **Check sync logs** - Verify date range calculation
3. **Check existing trips** - Device might already be synced

---

## 📝 Quick Reference

**Find Device ID:**
```sql
SELECT device_id FROM vehicles WHERE device_name = 'EPE511GA';
```

**Sync Command:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"device_ids": ["DEVICE_ID"], "force_full_sync": true}'
```

**Reconcile Command:**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"mode": "coordinates", "deviceId": "DEVICE_ID", "startDate": "2026-01-01", "endDate": "2026-01-21"}'
```

---

**Ready to test?** Start with Step 1 to find the device_id, then proceed with the sync command!
