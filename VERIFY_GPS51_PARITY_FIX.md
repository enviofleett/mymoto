# Verification Guide: GPS51 Parity Fix

## Quick Verification Steps

### 1. Check 32-bit Status Handling

**Test**: Verify no warnings for status values > 65535

**Query** (Supabase SQL Editor):
```sql
-- Check recent position updates with status values
SELECT 
  device_id,
  status_text,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  gps_time
FROM vehicle_positions
WHERE status_text IS NOT NULL
  AND ignition_detection_method = 'status_bit'
ORDER BY gps_time DESC
LIMIT 20;
```

**Expected**:
- ✅ No console warnings about "status exceeds expected range"
- ✅ `ignition_on` correctly set based on ACC bit
- ✅ `ignition_confidence` = 1.0 for status_bit detection
- ✅ Works with status values like 262151, 262150, etc.

### 2. Verify Trip Detection Logic

**Test**: Check that trips start on ACC ON (not speed)

**Query**:
```sql
-- Check recent trips and their start conditions
SELECT 
  device_id,
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) / 60 as duration_minutes
FROM vehicle_trips
WHERE start_time >= NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC
LIMIT 10;
```

**Expected**:
- ✅ Trips start immediately on ACC ON (no delay waiting for speed)
- ✅ Trip durations match GPS51 platform
- ✅ Distances are reasonable (within 10% of GPS51 if using Haversine)

### 3. Verify ACC-Based Trip End

**Test**: Check that trips end on ACC OFF or 180s idle

**Query**:
```sql
-- Check trip end times vs position history
WITH trip_ends AS (
  SELECT 
    device_id,
    end_time,
    LAG(end_time) OVER (PARTITION BY device_id ORDER BY end_time) as prev_end_time
  FROM vehicle_trips
  WHERE start_time >= NOW() - INTERVAL '24 hours'
)
SELECT 
  t.device_id,
  t.end_time,
  p.ignition_on as ignition_at_end,
  p.speed as speed_at_end,
  EXTRACT(EPOCH FROM (t.end_time - t.prev_end_time)) / 60 as minutes_since_prev_trip
FROM trip_ends t
LEFT JOIN LATERAL (
  SELECT ignition_on, speed
  FROM position_history
  WHERE device_id = t.device_id
    AND gps_time <= t.end_time
  ORDER BY gps_time DESC
  LIMIT 1
) p ON true
ORDER BY t.end_time DESC
LIMIT 10;
```

**Expected**:
- ✅ Trips end when `ignition_on` changes from true to false
- ✅ OR trips end after 180 seconds of `speed = 0` while `ignition_on = true`
- ✅ No trips ending prematurely due to speed-based detection

### 4. Compare with GPS51 Platform

**Manual Check**:
1. Open GPS51 platform for device `358657105966092`
2. Compare trip count and times for today
3. Verify our system matches GPS51:
   - ✅ Same number of trips
   - ✅ Trip start/end times within 1-2 seconds
   - ✅ Trip distances within 10% (Haversine vs GPS51 odometer)

### 5. Check for GPS Drift False Trips

**Query**:
```sql
-- Check for very short trips that might be GPS drift
SELECT 
  device_id,
  start_time,
  end_time,
  distance_km,
  duration_seconds,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_sec
FROM vehicle_trips
WHERE start_time >= NOW() - INTERVAL '24 hours'
  AND distance_km < 0.05  -- Less than 50 meters
  AND duration_seconds < 60  -- Less than 1 minute
ORDER BY start_time DESC;
```

**Expected**:
- ✅ Very few or no trips < 50 meters and < 1 minute
- ✅ If present, they should have valid ACC transitions (not GPS drift)

## Console Log Verification

**Check Edge Function Logs** (Supabase Dashboard → Edge Functions → Logs):

**Look for**:
- ✅ `[checkJt808AccBit] ACC ON detected: base bit 0 (status=262151, ...)`
- ✅ `[extractTripsFromHistory] ✅ Trip START (ACC ON) at ...`
- ✅ `[extractTripsFromHistory] ✅ Trip END (ACC OFF) at ...`
- ✅ `[extractTripsFromHistory] ✅ Trip END (idle timeout: 180s) at ...`

**Should NOT see**:
- ❌ `Status value exceeds expected range (0-65535)`
- ❌ `Trip START (movement detected)` (should be ACC-based)
- ❌ `Low ignition confidence` warnings for status_bit detection

## Success Criteria

✅ **All checks pass**:
1. No warnings for 32-bit status values
2. Trips start on ACC ON (immediate)
3. Trips end on ACC OFF or 180s idle
4. Trip counts match GPS51 platform
5. No GPS drift false trips

## Rollback Plan

If issues occur:
1. Revert `telemetry-normalizer.ts` to previous version
2. Revert `sync-trips-incremental/index.ts` to previous version
3. Redeploy Edge Functions
4. Monitor for 24 hours before retrying
