# Populate Ignition Confidence Data

## Current Status

The `ignition_confidence` and `ignition_detection_method` columns exist in both `vehicle_positions` and `position_history` tables, but they are currently `null` for existing records. The code to calculate these values is implemented in the `normalizeVehicleTelemetry` function, but it needs to run to populate the data.

## Solution Overview

There are two approaches to populate this data:

1. **Backfill Existing Records** (Simplified) - Uses available data (`status_text`, `speed`) to estimate confidence
2. **Fetch Fresh Data** (Best Accuracy) - Triggers the `gps-data` edge function to get full GPS51 raw data

## Option 1: Backfill Existing Records (Quick Fix)

**⚠️ IMPORTANT: If you get timeout errors, try the versions in this order:**
1. First try: `BACKFILL_IGNITION_CONFIDENCE_FAST.sql` (processes recent records only)
2. If still timing out: `BACKFILL_IGNITION_CONFIDENCE_BATCH_V2.sql` (device-based batching)
3. Last resort: Trigger `gps-data` function instead (Option 2 below)

### Version A: Last 1 Day (Recommended - Ultra Minimal Scope)

Run `BACKFILL_IGNITION_CONFIDENCE_1DAY.sql` - This version:
- Processes only last 24 hours of records
- Ultra minimal scope to avoid timeouts
- Run STEP 1 and STEP 2 separately

**To run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste **STEP 1 only** from `BACKFILL_IGNITION_CONFIDENCE_1DAY.sql`
3. Click "Run" and verify it completes
4. Then copy and paste **STEP 2** and run separately
5. Finally run **STEP 3** for summary

**Even simpler:** Use `BACKFILL_IGNITION_CONFIDENCE_1DAY_VEHICLES_ONLY.sql` to process only `vehicle_positions` table (skip `position_history` - it will be populated automatically by gps-data function).

### Version B: Last 3 Days (If 1 day works and you need more)

Run `BACKFILL_IGNITION_CONFIDENCE_3DAYS.sql` - This version:
- Processes last 3 days of records
- Run STEP 1 and STEP 2 separately if it times out

### Version B: Fast (90/30 Days - May Timeout on Large Tables)

Run `BACKFILL_IGNITION_CONFIDENCE_FAST.sql` - This version:
- Processes recent records (90 days for `vehicle_positions`, 30 days for `position_history`)
- May still timeout on very large tables
- Use only if 3-day version works and you need more historical data

### Version B: Batch Processing (For Very Large Tables)

If Version A still times out, use `BACKFILL_IGNITION_CONFIDENCE_BATCH_V2.sql`:
- Processes records by device_id (10 devices at a time)
- Run each batch query multiple times until no more records are updated
- Check progress between batches
- Most suitable for tables with millions of records

**To run:**
1. Open `BACKFILL_IGNITION_CONFIDENCE_BATCH_V2.sql`
2. Run **STEP 1** to see how many devices need processing
3. Run **STEP 2** queries multiple times (each processes 10 devices)
4. Run **STEP 3** after each batch to check progress
5. Continue until progress shows 100% complete
6. Then run **STEP 4** for `position_history` (processes one day at a time)

**Alternative:** `BACKFILL_IGNITION_CONFIDENCE_BATCH.sql` uses CTID-based batching (may not work in all Supabase environments)

### Version C: Full Backfill (May Timeout on Large Tables)

`BACKFILL_IGNITION_CONFIDENCE.sql` - Original version that processes all records:
- ⚠️ **Warning**: May timeout on very large tables
- Use only if you have a small dataset or can increase statement timeout

**What it does:**
- Uses `status_text` field to detect ACC patterns (confidence 0.9)
- Uses `speed` field for speed-based inference (confidence 0.3-0.5)
- Sets `unknown` method for records with insufficient data (confidence 0.0)

**Limitations:**
- Lower accuracy than fresh GPS51 data
- `position_history` doesn't have `status_text`, so only speed-based inference is available
- Cannot detect JT808 status bits (requires raw `status` field)

## Option 2: Fetch Fresh Data (Recommended)

Trigger the `gps-data` edge function to fetch fresh vehicle positions with full GPS51 raw data. This will populate ignition confidence with the highest accuracy.

### Method A: Via Supabase Dashboard

1. Go to **Edge Functions** → **gps-data**
2. Click the **"Invoke"** tab
3. Use this request body:
   ```json
   {
     "action": "lastposition",
     "use_cache": false
   }
   ```
4. Click **"Invoke Function"**
5. Check the **"Logs"** tab to see progress

### Method B: Via curl (Terminal)

```bash
curl -X POST 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/gps-data' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "lastposition",
    "use_cache": false
  }'
```

Replace:
- `YOUR_PROJECT_ID` with your Supabase project ID
- `YOUR_ANON_KEY` with your Supabase anonymous key (found in Project Settings → API)

### Method C: Via Your Application

If your app has a "Sync" or "Refresh" button for vehicle data, clicking it will trigger the `gps-data` function.

## What Happens When gps-data Runs

1. Fetches latest positions from GPS51 API
2. Normalizes telemetry using `normalizeVehicleTelemetry()` function
3. Calculates ignition confidence using multiple signals:
   - **JT808 status bit** (confidence 1.0) - highest accuracy
   - **String parsing** (confidence 0.9) - from `strstatus` field
   - **Speed inference** (confidence 0.3-0.5) - from speed > 5 km/h
   - **Multi-signal** (confidence 0.6-0.7) - combines multiple signals
4. Updates `vehicle_positions` table with confidence scores
5. Inserts into `position_history` with confidence scores

## Verification

After running either option, verify the data:

```sql
-- Check vehicle_positions
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  status_text
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
ORDER BY ignition_confidence DESC
LIMIT 10;

-- Check position_history
SELECT 
  device_id,
  ignition_on,
  ignition_confidence,
  ignition_detection_method,
  speed,
  gps_time
FROM position_history
WHERE ignition_confidence IS NOT NULL
ORDER BY gps_time DESC
LIMIT 10;

-- Summary statistics
SELECT 
  ignition_detection_method,
  COUNT(*) as count,
  ROUND(AVG(ignition_confidence)::NUMERIC, 3) as avg_confidence
FROM vehicle_positions
WHERE ignition_confidence IS NOT NULL
GROUP BY ignition_detection_method
ORDER BY count DESC;
```

## Expected Results

After running the `gps-data` function, you should see:
- `ignition_confidence` values between 0.0 and 1.0
- `ignition_detection_method` values: `status_bit`, `string_parse`, `speed_inference`, `multi_signal`, or `unknown`
- Higher confidence scores (0.9-1.0) for records with JT808 status bits or explicit ACC strings
- Lower confidence scores (0.3-0.5) for speed-based inference

## Ongoing Population

Going forward, the `gps-data` edge function will automatically populate ignition confidence for all new records. If you have a cron job or scheduled sync, it will maintain this data automatically.

## Troubleshooting

**If confidence scores are still null after running gps-data:**
1. Check Edge Function logs for errors
2. Verify GPS51 API is returning `status` or `strstatus` fields
3. Check that the `normalizeVehicleTelemetry` function is being called correctly

**If backfill shows mostly "unknown" method:**
- This is expected for `position_history` (no `status_text` field)
- For `vehicle_positions`, check if `status_text` contains ACC patterns
- Consider triggering `gps-data` for better accuracy

## Next Steps

1. **Immediate**: Run `BACKFILL_IGNITION_CONFIDENCE.sql` to populate existing records
2. **Best Practice**: Trigger `gps-data` function to get fresh data with full accuracy
3. **Ongoing**: Ensure your sync cron job is running regularly to maintain data freshness
