# Priority Fix Plan - Missing Coordinates Crisis

## Critical Status

**Top 10 devices with missing coordinates:**
- Device `13612330240`: 317/319 trips missing (99.37%)
- Device `13612330045`: 274/278 trips missing (98.56%)
- Device `13612330270`: 203/203 trips missing (100%)
- Device `13612330242`: 190/190 trips missing (100%)
- Device `13612333441`: 170/272 trips missing (62.50%)
- **Total from top 10: 1,939 trips need fixing**

## Action Plan (Prioritized)

### Phase 1: Deploy Fixes (10 minutes) - DO THIS FIRST

**1. Deploy Updated sync-trips-incremental Function**
- Prevents NEW trips from missing coordinates
- Location: Supabase Dashboard → Functions → sync-trips-incremental
- Replace code with: `supabase/functions/sync-trips-incremental/index.ts`

**2. Deploy Reconciliation Function**
- Fixes EXISTING trips with missing coordinates
- Location: Supabase Dashboard → Functions → Create New Function
- Name: `reconcile-gps51-data`
- Code: `supabase/functions/reconcile-gps51-data/index.ts`

### Phase 2: Test on Single Device (5 minutes)

**Test on device with most trips: `13612330240`**

Run this in Terminal (NOT SQL Editor):
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "13612330240",
    "mode": "coordinates",
    "startDate": "2026-01-06",
    "endDate": "2026-01-21"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "results": {
    "tripsFixed": 200-300,
    "tripsChecked": 319,
    "coordinatesBackfilled": 200-300
  }
}
```

**Verify Fix:**
Run this SQL query after reconciliation:
```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as still_missing,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_percent
FROM vehicle_trips
WHERE device_id = '13612330240'
  AND created_at >= NOW() - INTERVAL '7 days';
```

**Success Criteria:** `missing_percent` should drop from 99.37% to <20%

### Phase 3: Fix All Top 10 Devices (30 minutes)

Run reconciliation for each device (or all at once):

**Option A: Fix All Devices at Once (Recommended)**
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "coordinates",
    "startDate": "2026-01-06",
    "endDate": "2026-01-21"
  }'
```

**Option B: Fix Devices One by One (If Option A fails)**
```bash
# Device 1
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId": "13612330240", "mode": "coordinates", "startDate": "2026-01-06", "endDate": "2026-01-21"}'

# Device 2
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId": "13612330045", "mode": "coordinates", "startDate": "2026-01-06", "endDate": "2026-01-21"}'

# ... continue for all 10 devices
```

### Phase 4: Monitor Progress

**Check Overall Progress:**
```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as still_missing,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_percent
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Check Top 10 Devices Progress:**
```sql
SELECT 
  device_id,
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as still_missing,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_percent
FROM vehicle_trips
WHERE device_id IN (
  '13612330240', '13612330045', '13612330270', '13612330242', '13612333441',
  '13612330245', '13612330122', '13612330139', '13612330430', '13612330247'
)
AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY device_id
ORDER BY still_missing DESC;
```

## Why Some Devices Have 100% Missing

Possible reasons:
1. **No position_history data** - GPS data wasn't synced for those time periods
2. **Backfill window too narrow** - Old ±5min window missed coordinates
3. **GPS51 API didn't provide coordinates** - Some trips from GPS51 come without coordinates

## What Reconciliation Does

For each trip with (0,0) coordinates:
1. Searches `position_history` within ±15 minutes of trip start time
2. Searches `position_history` within ±15 minutes of trip end time
3. Updates trip with found coordinates
4. Reports success/failure

## Success Metrics

**Before Fix:**
- Overall: 76.44% missing
- Top device: 99.37% missing

**After Fix (Target):**
- Overall: <10% missing
- Top devices: <20% missing (some may not have position_history data)

## Timeline

- **Deploy functions:** 10 minutes
- **Test on 1 device:** 5 minutes
- **Fix all devices:** 30-60 minutes
- **Total:** ~1-2 hours

## Important Notes

1. **Some trips may not be fixable** - If `position_history` doesn't have data for that time period, coordinates can't be backfilled
2. **Run reconciliation during off-peak hours** - It queries the database heavily
3. **Monitor function logs** - Check Supabase Dashboard → Edge Functions → Logs for errors

## Next Steps After Fixing

1. ✅ Deploy updated `sync-trips-incremental` - Prevents future issues
2. ✅ Run reconciliation - Fixes existing data
3. ✅ Monitor for 24 hours - Ensure new trips have coordinates
4. ✅ Set up weekly reconciliation - Catch any edge cases
