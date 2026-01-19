# Quick Start: Get Confidence Data Populated

**Goal:** Trigger the edge function to populate ignition confidence data

## 🚀 Fastest Method (2 minutes)

### Step 1: Trigger Edge Function

**Via Supabase Dashboard:**
1. Open: https://supabase.com/dashboard/project/YOUR_PROJECT/edge-functions
2. Find: `gps-data` function
3. Click: **"Invoke"** button
4. Body: `{"action": "lastposition"}`
5. Click: **"Invoke Function"**
6. Wait: ~30-60 seconds

### Step 2: Verify It Worked

Run this query in SQL Editor:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(ignition_confidence) as with_confidence,
  MAX(cached_at) as latest_sync
FROM vehicle_positions
WHERE cached_at >= NOW() - INTERVAL '5 minutes';
```

**Expected Result:**
- `with_confidence` should be > 0
- `latest_sync` should be recent (last 5 minutes)

## ✅ Success Indicators

After sync, you should see:

1. **Confidence data exists:**
   ```sql
   SELECT COUNT(ignition_confidence) FROM vehicle_positions WHERE ignition_confidence IS NOT NULL;
   -- Should return > 0
   ```

2. **Recent sync timestamp:**
   ```sql
   SELECT MAX(cached_at) FROM vehicle_positions;
   -- Should be within last hour
   ```

3. **Detection methods visible:**
   ```sql
   SELECT ignition_detection_method, COUNT(*) 
   FROM vehicle_positions 
   WHERE ignition_detection_method IS NOT NULL
   GROUP BY ignition_detection_method;
   -- Should show: status_bit, string_parse, etc.
   ```

## 🔄 Set Up Automatic Syncing (Optional)

If you want automatic syncing every 5 minutes:

1. Check if cron exists:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'sync-gps-data';
   ```

2. If not, the migration should have created it. If missing, see:
   - `supabase/migrations/20260114000000_reduce_cron_frequency.sql`

## 📊 Next Steps After Data is Populated

1. **Run verification queries:**
   - `VERIFY_IGNITION_IMPLEMENTATION.sql`
   - `CHECK_MONITORING_QUALITY.sql`

2. **Check detection quality:**
   ```sql
   SELECT * FROM check_ignition_detection_quality(24);
   ```

3. **Monitor confidence scores:**
   ```sql
   SELECT 
     ignition_detection_method,
     AVG(ignition_confidence) as avg_confidence,
     COUNT(*) as count
   FROM vehicle_positions
   WHERE ignition_confidence IS NOT NULL
   GROUP BY ignition_detection_method;
   ```

## 🆘 Still No Data?

If confidence is still NULL after sync:

1. **Check edge function logs** for errors
2. **Verify GPS51 API** is returning status data
3. **Check normalizer** is being called (look for log messages)
4. **Run diagnostics:** `DIAGNOSE_CONFIDENCE_ISSUE.sql`

## Summary

**One Action Required:** Trigger `gps-data` edge function  
**Time:** 2 minutes  
**Result:** Confidence data will start populating
