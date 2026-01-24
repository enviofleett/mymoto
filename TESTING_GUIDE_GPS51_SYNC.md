# GPS51 Data Sync Testing & Verification Guide

## Overview

This guide provides step-by-step instructions to verify that the GPS51 data sync implementation achieves 100% accuracy match with the GPS51 platform.

---

## Prerequisites

1. Access to GPS51 platform (https://gps51.com)
2. Access to your dashboard
3. At least one active vehicle with recent trip/alarm data
4. Database access (Supabase dashboard or SQL client)

---

## Test Plan

### Phase 1: Database Migration Verification

#### Test 1.1: Verify Tables Exist

```sql
-- Check that GPS51 sync tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status');
-- Expected: 3 rows (all three tables should exist)
```

#### Test 1.2: Verify Indexes Exist

```sql
-- Check indexes for performance
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status')
ORDER BY tablename, indexname;
-- Expected: Multiple indexes including idx_gps51_trips_device_time, etc.
```

#### Test 1.3: Verify RLS Policies

```sql
-- Check Row Level Security policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('gps51_trips', 'gps51_alarms', 'gps51_sync_status')
ORDER BY tablename, policyname;
-- Expected: Multiple policies for each table
```

✅ **PASS CRITERIA**: All tables, indexes, and policies exist

---

### Phase 2: Edge Function Verification

#### Test 2.1: Verify Edge Functions Exist

Check Supabase Dashboard → Edge Functions:
- `sync-gps51-trips` should be deployed
- `sync-gps51-alarms` should be deployed

Or use CLI:
```bash
supabase functions list
```

✅ **PASS CRITERIA**: Both functions are deployed and active

#### Test 2.2: Manual Trip Sync Test

```sql
-- Manually trigger trip sync for a test vehicle
SELECT trigger_gps51_trips_sync('YOUR_DEVICE_ID_HERE', 7);
```

Expected response:
```json
{
  "success": true,
  "device_id": "YOUR_DEVICE_ID",
  "records_received": 10,
  "trips_inserted": 8,
  "trips_updated": 2,
  "errors": 0
}
```

Then verify trips were inserted:
```sql
SELECT COUNT(*) FROM gps51_trips WHERE device_id = 'YOUR_DEVICE_ID_HERE';
-- Expected: > 0
```

✅ **PASS CRITERIA**: Trips sync successfully, count > 0

#### Test 2.3: Manual Alarm Sync Test

```sql
-- Manually trigger alarm sync for test vehicles
SELECT trigger_gps51_alarms_sync(ARRAY['YOUR_DEVICE_ID_HERE']);
```

Expected response:
```json
{
  "success": true,
  "alarms_found": 5,
  "alarms_inserted": 5,
  "errors": 0
}
```

Then verify alarms were inserted:
```sql
SELECT COUNT(*) FROM gps51_alarms WHERE device_id = 'YOUR_DEVICE_ID_HERE';
-- Expected: >= 0 (may be 0 if no alarms)
```

✅ **PASS CRITERIA**: Alarms sync successfully (even if count is 0)

---

### Phase 3: Data Accuracy Verification

#### Test 3.1: Trip Report 100% Match

**Step 1**: Open GPS51 platform
- Navigate to: Reports → Trip Report
- Select vehicle: [YOUR_TEST_VEHICLE]
- Date range: Today
- Note down:
  - Number of trips
  - First trip start time
  - First trip distance
  - First trip avg speed

**Step 2**: Query dashboard database
```sql
SELECT
  device_id,
  start_time,
  distance_km,
  avg_speed_kmh,
  max_speed_kmh
FROM gps51_trips
WHERE device_id = 'YOUR_DEVICE_ID'
  AND start_time::date = CURRENT_DATE
ORDER BY start_time DESC;
```

**Step 3**: Compare
- ✅ Trip count matches?
- ✅ Start time matches (within 1 second)?
- ✅ Distance matches (within 0.1 km)?
- ✅ Speed matches (within 1 km/h)?

✅ **PASS CRITERIA**: All 4 checks pass

#### Test 3.2: Mileage Report 100% Match

**Step 1**: Open GPS51 platform
- Navigate to: Reports → Mileage Report
- Select vehicle: [YOUR_TEST_VEHICLE]
- Date range: Last 7 days
- Note down:
  - Total distance
  - Fuel consumption (L/100km)
  - ACC time

**Step 2**: Query dashboard database
```sql
SELECT
  statisticsday,
  totaldistance / 1000.0 AS distance_km,
  oilper100km AS fuel_consumption,
  totalacc / 1000 / 60 AS acc_minutes
FROM vehicle_mileage_details
WHERE device_id = 'YOUR_DEVICE_ID'
  AND statisticsday >= CURRENT_DATE - 7
ORDER BY statisticsday DESC;
```

**Step 3**: Compare
- ✅ Distance matches (within 1 km)?
- ✅ Fuel consumption matches (within 0.5 L/100km)?
- ✅ ACC time matches (within 5 minutes)?

✅ **PASS CRITERIA**: All 3 checks pass

#### Test 3.3: Alarm Report 100% Match

**Step 1**: Open GPS51 platform
- Navigate to: Reports → Alarm Report
- Select vehicle: [YOUR_TEST_VEHICLE]
- Date range: Last 7 days
- Note down:
  - Number of alarms
  - Latest alarm type
  - Latest alarm time

**Step 2**: Query dashboard database
```sql
SELECT
  alarm_time,
  alarm_description_en,
  alarm_code,
  severity,
  latitude,
  longitude
FROM gps51_alarms
WHERE device_id = 'YOUR_DEVICE_ID'
  AND alarm_time >= CURRENT_DATE - 7
ORDER BY alarm_time DESC;
```

**Step 3**: Compare
- ✅ Alarm count matches?
- ✅ Alarm type/description matches?
- ✅ Alarm time matches (within 1 second)?

✅ **PASS CRITERIA**: All 3 checks pass

---

### Phase 4: Frontend Display Verification

#### Test 4.1: Trip Report UI

**Step 1**: Open dashboard
- Navigate to: Vehicle Profile → [YOUR_TEST_VEHICLE]
- Click on "Trips" tab

**Step 2**: Verify trip data
- ✅ Trips are displayed from `gps51_trips` table
- ✅ Trip count matches GPS51 platform
- ✅ Trip distances match GPS51 platform
- ✅ Trip start/end times match GPS51 platform

**Step 3**: Check browser console
```javascript
// Open DevTools (F12) → Console
// No errors should appear
// Query key should be 'gps51-trips' (not 'vehicle-trips')
```

✅ **PASS CRITERIA**: UI displays GPS51 data accurately, no console errors

#### Test 4.2: Mileage Report UI

**Step 1**: Open dashboard
- Navigate to: Vehicle Profile → [YOUR_TEST_VEHICLE]
- View mileage section

**Step 2**: Verify mileage data
- ✅ Fuel consumption matches GPS51 platform
- ✅ Total distance matches GPS51 platform
- ✅ No "N/A" or missing data (unless GPS51 also shows N/A)

✅ **PASS CRITERIA**: UI displays GPS51 mileage data accurately

#### Test 4.3: Alarm Report UI

**Step 1**: Open dashboard
- Navigate to: Vehicle Profile → [YOUR_TEST_VEHICLE]
- View alerts/alarms section

**Step 2**: Verify alarm data
- ✅ Alarms are displayed from `gps51_alarms` table
- ✅ Alarm count matches GPS51 platform
- ✅ Alarm descriptions match GPS51 platform
- ✅ Alarm times match GPS51 platform

**Step 3**: Check browser console
```javascript
// Query key should be 'gps51-alarms' (not 'vehicle-alerts')
```

✅ **PASS CRITERIA**: UI displays GPS51 alarms accurately

---

### Phase 5: Automatic Sync Verification

#### Test 5.1: Verify Cron Jobs are Running

```sql
-- Check cron job status
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname LIKE 'sync-gps51%'
ORDER BY jobname;
```

Expected output:
```
| jobname                          | schedule      | active | jobid |
|----------------------------------|---------------|--------|-------|
| sync-gps51-trips-all-vehicles    | */10 * * * *  | true   | 1     |
| sync-gps51-alarms-all-vehicles   | */5 * * * *   | true   | 2     |
```

✅ **PASS CRITERIA**: Both cron jobs exist and are active

#### Test 5.2: Verify Cron Jobs Have Run

```sql
-- Check recent cron job runs
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE 'sync-gps51%'
)
ORDER BY start_time DESC
LIMIT 10;
```

Expected: Recent runs (within last 10 minutes for alarms, 15 minutes for trips)

✅ **PASS CRITERIA**: Cron jobs have run recently with status='succeeded'

#### Test 5.3: Verify Sync Status is Updated

```sql
-- Check GPS51 sync status
SELECT
  device_id,
  last_trip_sync_at,
  last_alarm_sync_at,
  trips_synced_count,
  alarms_synced_count,
  sync_status,
  trip_sync_error,
  alarm_sync_error
FROM gps51_sync_status
WHERE device_id = 'YOUR_DEVICE_ID';
```

Expected:
- `last_trip_sync_at` is recent (within 10 minutes)
- `last_alarm_sync_at` is recent (within 5 minutes)
- `sync_status` = 'completed'
- No errors

✅ **PASS CRITERIA**: Sync status shows recent successful syncs

---

### Phase 6: Performance Verification

#### Test 6.1: Query Performance

```sql
-- Test query speed for trips
EXPLAIN ANALYZE
SELECT *
FROM gps51_trips
WHERE device_id = 'YOUR_DEVICE_ID'
  AND start_time >= CURRENT_DATE - 30
ORDER BY start_time DESC
LIMIT 50;
```

Expected: Execution time < 50ms, uses index scan

```sql
-- Test query speed for alarms
EXPLAIN ANALYZE
SELECT *
FROM gps51_alarms
WHERE device_id = 'YOUR_DEVICE_ID'
  AND alarm_time >= CURRENT_DATE - 30
ORDER BY alarm_time DESC
LIMIT 50;
```

Expected: Execution time < 50ms, uses index scan

✅ **PASS CRITERIA**: Both queries complete in < 50ms with index usage

---

## Regression Testing

After implementation, perform these checks to ensure existing functionality still works:

### Regression 1: Position History Still Works
```sql
SELECT COUNT(*) FROM position_history WHERE device_id = 'YOUR_DEVICE_ID';
-- Expected: Should still have data
```

### Regression 2: Vehicle List Still Works
- Navigate to: Dashboard → Vehicles
- ✅ All vehicles are displayed
- ✅ No console errors

### Regression 3: Real-time Tracking Still Works
- Navigate to: Live Map
- ✅ Vehicle positions update in real-time
- ✅ No console errors

---

## Troubleshooting

### Issue: No trips in gps51_trips table

**Cause**: Sync hasn't run yet or device has no trips

**Solution**:
```sql
-- Manually trigger sync
SELECT trigger_gps51_trips_sync('YOUR_DEVICE_ID', 30);

-- Check for errors
SELECT * FROM gps51_sync_status WHERE device_id = 'YOUR_DEVICE_ID';
```

### Issue: Trips don't match GPS51 platform

**Cause**: Different time ranges or sync hasn't completed

**Solution**:
1. Verify same date range in both GPS51 and dashboard
2. Wait for next sync (max 10 minutes)
3. Check `gps51_raw_data` column to see what GPS51 returned

### Issue: Alarms show 0 count but GPS51 has alarms

**Cause**: Alarm sync hasn't run or alarms have code 0 (no alarm)

**Solution**:
```sql
-- Check if GPS51 position data has alarms
SELECT
  deviceid,
  alarm,
  stralarm,
  updatetime
FROM position_history
WHERE device_id = 'YOUR_DEVICE_ID'
  AND alarm IS NOT NULL
  AND alarm != 0
ORDER BY gps_time DESC
LIMIT 10;

-- Manually trigger alarm sync
SELECT trigger_gps51_alarms_sync(ARRAY['YOUR_DEVICE_ID']);
```

### Issue: Cron jobs not running

**Cause**: App settings not configured

**Solution**:
```sql
-- Set app settings (replace with your actual values)
SELECT set_app_setting('supabase_url', 'https://your-project.supabase.co');
SELECT set_app_setting('supabase_service_role_key', 'your-service-role-key');

-- Verify settings
SELECT * FROM app_settings WHERE key LIKE 'supabase%';
```

---

## Success Criteria Summary

✅ All database tables exist and have correct schema
✅ Both Edge Functions deploy and execute successfully
✅ Trip data matches GPS51 platform 100% (count, distance, times)
✅ Mileage data matches GPS51 platform 100% (distance, fuel, ACC)
✅ Alarm data matches GPS51 platform 100% (count, type, time)
✅ Frontend displays GPS51 data (not calculated data)
✅ Cron jobs run automatically every 5-10 minutes
✅ No performance degradation (queries < 50ms)
✅ No console errors in browser
✅ No regressions in existing features

---

## Final Validation Checklist

- [ ] Phase 1: Database Migration - All tests pass
- [ ] Phase 2: Edge Functions - All tests pass
- [ ] Phase 3: Data Accuracy - All tests pass
- [ ] Phase 4: Frontend Display - All tests pass
- [ ] Phase 5: Automatic Sync - All tests pass
- [ ] Phase 6: Performance - All tests pass
- [ ] Regression Testing - No issues found

**Implementation is 100% accurate when ALL checkboxes are checked.**
