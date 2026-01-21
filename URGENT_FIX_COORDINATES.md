# Urgent: Fix Missing Coordinates (76.44% Missing)

**Current Status:** 3,011 out of 3,939 trips are missing coordinates (76.44%)

## What This Means

Your query results show:
- ✅ **3,939 trips** in the last 7 days
- ✅ **75 devices** with trip data
- ❌ **3,011 trips (76.44%)** have (0,0) coordinates - **NEEDS FIXING**

## Why This Happened

1. **Fixes not deployed yet** - The updated `sync-trips-incremental` function with ±15min backfill hasn't been deployed
2. **Existing data not reconciled** - Old trips with missing coordinates need to be fixed

## Immediate Action Plan

### Step 1: Deploy the Fixed Function (5 minutes)

**Go to Supabase Dashboard:**
1. Navigate to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Find `sync-trips-incremental` function
3. Click "Edit"
4. Replace the code with the updated version from: `supabase/functions/sync-trips-incremental/index.ts`
5. Click "Deploy"

**Key changes in the fix:**
- Backfill window: ±5min → ±15min (lines 1106-1108, 1126-1128)
- First sync: 3 days → 30 days (line 974)

### Step 2: Deploy Reconciliation Function (5 minutes)

**Create new function:**
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click "Create a new function"
3. Name: `reconcile-gps51-data`
4. Copy code from: `supabase/functions/reconcile-gps51-data/index.ts`
5. Click "Deploy"

### Step 3: Run Reconciliation on Existing Data (30-60 minutes)

**⚠️ IMPORTANT:** Run this in Terminal/Command Prompt, NOT SQL Editor!

**Option A: Fix All Devices (Recommended)**
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

**Option B: Test on Single Device First**
```bash
# Replace YOUR_DEVICE_ID with an actual device_id from your results
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "YOUR_DEVICE_ID",
    "mode": "coordinates",
    "startDate": "2026-01-06",
    "endDate": "2026-01-21"
  }'
```

**To get your Service Role Key:**
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/api
2. Find "service_role" key (keep it secret!)
3. Replace `YOUR_SERVICE_ROLE_KEY` in the curl command

### Step 4: Verify the Fix (After Reconciliation)

Run Query #4 again in SQL Editor:
```sql
SELECT 
  COUNT(*) as total_trips,
  COUNT(DISTINCT device_id) as devices_with_trips,
  ROUND(AVG(distance_km)::numeric, 2) as avg_distance_km,
  COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as trips_missing_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_coords_percent,
  MIN(start_time) as earliest_trip,
  MAX(start_time) as latest_trip
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days';
```

**Expected Results After Fix:**
- `missing_coords_percent` should drop from **76.44%** to **<10%**
- `trips_missing_coords` should drop from **3,011** to **<400**

## Timeline

- **Deploy functions:** 10 minutes
- **Reconciliation (all devices):** 30-60 minutes
- **Total:** ~1 hour to fix all 3,011 trips

## What Reconciliation Does

The reconciliation function will:
1. Find all trips with (0,0) coordinates
2. Search `position_history` within ±15 minutes of trip start/end times
3. Update trips with found coordinates
4. Report how many were fixed

## After Reconciliation

Once reconciliation completes, you should see:
- ✅ 90-95% coordinate completeness (up from 23.56%)
- ✅ All new trips will automatically use ±15min backfill
- ✅ First sync for new devices gets 30 days of history

## Monitoring

Check progress during reconciliation:
```sql
-- See how many trips still need fixing
SELECT 
  COUNT(*) as still_missing,
  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM vehicle_trips WHERE created_at >= NOW() - INTERVAL '7 days') as percent_still_missing
FROM vehicle_trips
WHERE (start_latitude = 0 OR end_latitude = 0)
  AND created_at >= NOW() - INTERVAL '7 days';
```

Run this query periodically to see the number decreasing as reconciliation progresses.
