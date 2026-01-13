# Force Re-sync Instructions - Fix Missing Trips

## Problem
Database shows 2 trips, but GPS51 shows 5 trips. The updated function needs to be redeployed and a force sync needs to run.

## Step-by-Step Fix

### Step 1: Reset Existing Trips (Optional but Recommended)
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql
2. Run the SQL from `reset_and_resync_trips.sql`:
   ```sql
   -- Delete existing trips for today
   DELETE FROM vehicle_trips
   WHERE device_id = '358657105967694'
     AND start_time >= date_trunc('day', now());
   
   -- Reset sync status
   DELETE FROM trip_sync_status
   WHERE device_id = '358657105967694';
   ```
3. This clears old trips so the new algorithm can re-detect them

### Step 2: Deploy Updated Function
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental`
3. **Copy ALL code** from: `supabase/functions/sync-trips-incremental/index.ts`
4. **Paste** into the function editor
5. Click **"Deploy"** or **"Save"**
6. Wait for deployment to complete

### Step 3: Run Force Full Sync

#### Option A: Via Your App (Easiest)
1. Go to vehicle profile page for device `358657105967694`
2. Click the **"Sync"** button
3. Make sure **"Force Full Sync"** is enabled/checked
4. Wait for sync to complete

#### Option B: Via Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental`
3. Go to "Invoke" tab
4. Use this payload:
   ```json
   {
     "device_ids": ["358657105967694"],
     "force_full_sync": true
   }
   ```
5. Click "Invoke"
6. Check the logs for results

#### Option C: Via curl (Terminal)
```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-trips-incremental' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_ids": ["358657105967694"],
    "force_full_sync": true
  }'
```

### Step 4: Verify Results
Run this SQL query:
```sql
SELECT 
  COUNT(*) AS trips_today,
  SUM(distance_km) AS total_distance_km
FROM vehicle_trips
WHERE device_id = '358657105967694'
  AND start_time >= date_trunc('day', now());
```

**Expected Result:** 5 trips (matching GPS51)

### Step 5: Check Function Logs
1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental`
3. Go to "Logs" tab
4. Look for:
   - `[extractTripsFromHistory] Using ignition-based detection`
   - `[extractTripsFromHistory] Extracted X trips`
   - `[sync-trips-incremental] Inserted trip: ...`

## Troubleshooting

### If still only 2 trips:

1. **Check position_history has ignition data:**
   ```sql
   SELECT 
     COUNT(*) AS total,
     COUNT(CASE WHEN ignition_on = true THEN 1 END) AS ignition_on_count,
     COUNT(CASE WHEN ignition_on = false THEN 1 END) AS ignition_off_count
   FROM position_history
   WHERE device_id = '358657105967694'
     AND gps_time >= date_trunc('day', now());
   ```

2. **If no ignition data:** The function will fall back to speed-based detection, which might miss some trips.

3. **Check function logs** for errors or warnings

4. **Verify position_history has data for all 5 trip times:**
   - 07:51 (Trip 1)
   - 08:05 (Trip 2)
   - 08:22 (Trip 3)
   - 11:33 (Trip 4)
   - 11:52 (Trip 5)

## Important Notes

- **Force full sync is required** - incremental sync won't reprocess old data
- **Function must be redeployed** - old code won't have the ignition-based detection
- **Position history must have data** - if data is missing, trips can't be detected
- **Ignition data is preferred** - if available, detection is more accurate
