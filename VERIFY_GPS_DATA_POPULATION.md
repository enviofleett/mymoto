# Verify GPS-Data Function Populates Ignition Confidence

## ✅ Confirmation: Function is Already Correctly Configured

The `gps-data` edge function is **already correctly configured** to populate `ignition_confidence` and `ignition_detection_method` for all new records.

### Code Verification

In `supabase/functions/gps-data/index.ts`:

1. **Line 159-160**: `vehicle_positions` table gets populated with:
   ```typescript
   ignition_confidence: normalized.ignition_confidence || null,
   ignition_detection_method: normalized.ignition_detection_method || null,
   ```

2. **Line 232-233**: `position_history` table gets populated with:
   ```typescript
   ignition_confidence: p.ignition_confidence || null,
   ignition_detection_method: p.ignition_detection_method || null,
   ```

3. **Line 123-125**: The normalization function calculates confidence:
   ```typescript
   const normalized = normalizeVehicleTelemetry(record as Gps51RawData, {
     offlineThresholdMs: OFFLINE_THRESHOLD_MS,
   });
   ```

The `normalizeVehicleTelemetry` function (from `_shared/telemetry-normalizer.ts`) calculates:
- **JT808 status bit** detection (confidence 1.0)
- **String parsing** from `strstatus` (confidence 0.9)
- **Speed inference** (confidence 0.3-0.5)
- **Multi-signal** detection (confidence 0.6-0.7)

## Going Forward: Automatic Population

✅ **All new records** fetched by the `gps-data` function will automatically have:
- `ignition_confidence` populated (0.0 to 1.0)
- `ignition_detection_method` populated (`status_bit`, `string_parse`, `speed_inference`, `multi_signal`, or `unknown`)

## How to Verify It's Working

### Method 1: Trigger the Function and Check

1. **Invoke the gps-data function:**
   - Go to Supabase Dashboard → Edge Functions → `gps-data` → Invoke
   - Use body: `{"action": "lastposition", "use_cache": false}`
   - Click "Invoke Function"

2. **Check the results:**
   ```sql
   SELECT 
     device_id,
     ignition_on,
     ignition_confidence,
     ignition_detection_method,
     speed,
     status_text,
     last_synced_at
   FROM vehicle_positions
   WHERE last_synced_at >= NOW() - INTERVAL '5 minutes'
   ORDER BY last_synced_at DESC
   LIMIT 10;
   ```

   You should see:
   - `ignition_confidence` is NOT NULL (values between 0.0 and 1.0)
   - `ignition_detection_method` is NOT NULL (one of: `status_bit`, `string_parse`, `speed_inference`, `multi_signal`, `unknown`)

### Method 2: Check Recent Records

```sql
-- Check if recent records have confidence populated
SELECT 
  COUNT(*) FILTER (WHERE ignition_confidence IS NOT NULL) as with_confidence,
  COUNT(*) FILTER (WHERE ignition_confidence IS NULL) as without_confidence,
  MAX(last_synced_at) as most_recent_sync
FROM vehicle_positions
WHERE last_synced_at >= NOW() - INTERVAL '1 hour';
```

If `with_confidence` > 0, the function is working correctly.

### Method 3: Monitor Edge Function Logs

1. Go to Supabase Dashboard → Edge Functions → `gps-data` → Logs
2. Look for log messages like:
   ```
   [syncPositions] Low ignition confidence (0.3) for device=XXX, method=speed_inference
   ```
   This confirms the function is calculating confidence scores.

## Expected Behavior

After triggering `gps-data`:

1. **vehicle_positions** table:
   - All records updated will have `ignition_confidence` and `ignition_detection_method` populated
   - Confidence scores will be based on available GPS51 signals (status bits, string parsing, speed)

2. **position_history** table:
   - New records inserted will have `ignition_confidence` and `ignition_detection_method` populated
   - Only records that meet the "smart history" criteria (>50m movement or >5 min elapsed) are inserted

## Troubleshooting

**If confidence is still null after triggering gps-data:**

1. **Check Edge Function logs** for errors
2. **Verify GPS51 API** is returning `status` or `strstatus` fields
3. **Check normalization function** is being called (look for normalization logs)
4. **Verify database columns** exist:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'vehicle_positions' 
   AND column_name IN ('ignition_confidence', 'ignition_detection_method');
   ```

## Summary

✅ **No code changes needed** - The function is already correctly configured.

✅ **Going forward** - All new data will automatically have confidence scores.

✅ **Backfill** - Use `BACKFILL_IGNITION_CONFIDENCE_3DAYS.sql` to populate existing records from the last 3 days.
