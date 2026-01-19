# Root Cause Analysis: Missing Confidence Data

**Date:** 2026-01-20  
**Issue:** 272,600 records in `position_history` and 1,048 in `vehicle_positions`, but 0 with confidence data

## Findings

### Data Status
- ✅ Columns exist in both tables
- ✅ Edge function code includes confidence fields (verified in `gps-data/index.ts`)
- ❌ No confidence data populated (0 records with confidence)
- ⚠️ Latest `vehicle_positions` record: 2026-01-19 (yesterday - stale)
- ⚠️ Latest `position_history` record: 2041-01-31 (future date - data quality issue)

## Root Causes

### 1. Edge Function Hasn't Run Recently ⚠️
- Latest `vehicle_positions` update: 2026-01-19 11:10:00
- This is **yesterday**, meaning the edge function hasn't run in ~24+ hours
- **Impact:** No new data = no confidence data

### 2. Historical Data Was Inserted Before Columns Existed 📅
- 272,600 records in `position_history` likely inserted before confidence columns were added
- These records won't have confidence data unless backfilled
- **Impact:** Historical data lacks confidence scores

### 3. Data Quality Issue 🐛
- `position_history` has records with `gps_time` = 2041-01-31 (future date)
- This suggests corrupted or test data
- **Impact:** May indicate other data quality issues

## Solutions

### Immediate Actions

#### 1. Trigger Edge Function to Get Fresh Data
```bash
# Manually invoke gps-data edge function
supabase functions invoke gps-data --data '{"action": "lastposition"}'
```

Or via Supabase Dashboard:
- Edge Functions → gps-data → Invoke
- Body: `{"action": "lastposition"}`

#### 2. Verify Edge Function is Running
Check if cron job is scheduled:
```sql
SELECT * FROM cron.job WHERE jobname LIKE '%gps%';
```

#### 3. Check Edge Function Logs
Look for:
- Errors when writing confidence data
- Warnings about low confidence
- Normalizer returning undefined/null

### Medium-Term Actions

#### 4. Backfill Historical Data (Optional)
If you want confidence data for existing records:
```sql
-- This would require re-processing historical GPS51 data
-- Not recommended unless critical - focus on new data instead
```

#### 5. Fix Data Quality Issues
Clean up future dates in `position_history`:
```sql
-- Identify and fix future dates
SELECT COUNT(*) 
FROM position_history 
WHERE gps_time > NOW() + INTERVAL '1 year';

-- Consider deleting or correcting these records
```

### Long-Term Actions

#### 6. Monitor Edge Function Health
- Set up alerts if `cached_at` becomes stale (>1 hour old)
- Monitor edge function execution logs
- Track confidence data population rate

## Expected Behavior After Fix

Once the edge function runs:

1. ✅ New positions will have `ignition_confidence` populated
2. ✅ New positions will have `ignition_detection_method` populated
3. ✅ `vehicle_positions` will show confidence data
4. ✅ New `position_history` records will include confidence

## Verification Steps

After triggering the edge function:

1. Run `DIAGNOSE_CONFIDENCE_ISSUE.sql` again
2. Check `cached_at` timestamps - should be recent
3. Check `ignition_confidence` - should have values
4. Check `ignition_detection_method` - should have values

## Summary

**Primary Issue:** Edge function hasn't run since columns were added  
**Solution:** Trigger the `gps-data` edge function manually or verify cron is running  
**Expected Result:** New positions will have confidence data populated

The code is correct - it just needs to run to populate the data.
