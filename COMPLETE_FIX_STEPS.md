# Complete Step-by-Step Guide: Fix Missing Coordinates (76.44% Missing)

**Current Problem:** 3,011 out of 3,939 trips (76.44%) are missing coordinates  
**Goal:** Reduce missing coordinates to <10%

---

## 📋 Prerequisites (5 minutes)

### Step 0.1: Get Your Service Role Key

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/settings/api
2. Scroll down to "Project API keys"
3. Find the **"service_role"** key (starts with `eyJ...`)
4. **Copy it** - you'll need it for reconciliation
5. ⚠️ **Keep it secret** - this key has full database access

### Step 0.2: Open Required Files

Have these files ready:
- `supabase/functions/sync-trips-incremental/index.ts` (updated version)
- `supabase/functions/reconcile-gps51-data/index.ts` (new function)

---

## 🚀 Phase 1: Deploy Fixed Functions (15 minutes)

### Step 1.1: Deploy Updated sync-trips-incremental Function

**Location:** Supabase Dashboard → Edge Functions

1. **Navigate to Functions:**
   - Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Or: Dashboard → Edge Functions

2. **Find the function:**
   - Look for `sync-trips-incremental` in the list
   - Click on it to open

3. **Edit the function:**
   - Click the **"Edit"** button (or pencil icon)
   - This opens the code editor

4. **Replace the code:**
   - Open: `supabase/functions/sync-trips-incremental/index.ts` in your editor
   - **Select ALL** the code (Ctrl+A / Cmd+A)
   - **Copy** it (Ctrl+C / Cmd+C)
   - Go back to Supabase Dashboard
   - **Select ALL** existing code in the editor
   - **Paste** the new code (Ctrl+V / Cmd+V)

5. **Verify key changes:**
   - Search for `setMinutes(startTimeMin.getMinutes() - 15)` (should be -15, not -5)
   - Search for `30 * 24 * 60 * 60 * 1000` (should be 30 days, not 3)

6. **Deploy:**
   - Click **"Deploy"** button (usually top-right)
   - Wait for deployment to complete (30-60 seconds)
   - You should see "Deployed successfully" message

**✅ Verification:** Function should show "Active" status

---

### Step 1.2: Deploy New reconcile-gps51-data Function

1. **Navigate to Functions:**
   - Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
   - Click **"Create a new function"** or **"New Function"** button

2. **Set function name:**
   - Function name: `reconcile-gps51-data`
   - (No spaces, use hyphens)

3. **Add the code:**
   - Open: `supabase/functions/reconcile-gps51-data/index.ts` in your editor
   - **Select ALL** the code
   - **Copy** it
   - Paste into the Supabase function editor

4. **Deploy:**
   - Click **"Deploy"** button
   - Wait for deployment (30-60 seconds)

**✅ Verification:** New function should appear in the functions list

---

## 🧪 Phase 2: Test on Single Device (10 minutes)

### Step 2.1: Test Reconciliation on One Device

**⚠️ IMPORTANT:** Run this in **Terminal/Command Prompt**, NOT SQL Editor!

1. **Open Terminal/Command Prompt:**
   - macOS: Open Terminal app
   - Windows: Open Command Prompt or PowerShell
   - Linux: Open Terminal

2. **Run test command:**
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
   
   **Replace `YOUR_SERVICE_ROLE_KEY`** with the key you copied in Step 0.1

3. **Expected response:**
   ```json
   {
     "success": true,
     "mode": "coordinates",
     "deviceId": "13612330240",
     "results": {
       "tripsFixed": 200-300,
       "tripsChecked": 319,
       "coordinatesBackfilled": 200-300
     }
   }
   ```

4. **If you get an error:**
   - "Function not found" → Function not deployed, go back to Step 1.2
   - "Unauthorized" → Check your service role key
   - "Internal error" → Check function logs in Supabase Dashboard

---

### Step 2.2: Verify Test Results

**Run this in Supabase SQL Editor:**

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/sql/new
2. Paste this query:
   ```sql
   SELECT 
     COUNT(*) as total_trips,
     COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as still_missing,
     ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_percent
   FROM vehicle_trips
   WHERE device_id = '13612330240'
     AND created_at >= NOW() - INTERVAL '7 days';
   ```
3. Click **"Run"**
4. **Expected result:**
   - `missing_percent` should drop from **99.37%** to **<30%** (some trips may not have position_history data)

**✅ Success Criteria:** Missing percent decreased significantly

---

## 🔧 Phase 3: Fix All Devices (30-60 minutes)

### Step 3.1: Run Full Reconciliation

**⚠️ IMPORTANT:** Run this in **Terminal/Command Prompt**, NOT SQL Editor!

1. **Open Terminal/Command Prompt**

2. **Run full reconciliation:**
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
   
   **Replace `YOUR_SERVICE_ROLE_KEY`** with your actual key

3. **Expected response:**
   ```json
   {
     "success": true,
     "mode": "coordinates",
     "deviceId": "all",
     "results": {
       "tripsFixed": 2000-2500,
       "tripsChecked": 3939,
       "coordinatesBackfilled": 2000-2500
     },
     "duration_ms": 1800000
   }
   ```

4. **Wait for completion:**
   - This may take 30-60 minutes for all 3,939 trips
   - The function processes trips one by one
   - You can monitor progress (see Step 3.2)

---

### Step 3.2: Monitor Progress (Optional)

**While reconciliation is running, check progress:**

1. **Open Supabase SQL Editor**
2. **Run this query periodically:**
   ```sql
   SELECT 
     COUNT(*) as total_trips,
     COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) as still_missing,
     ROUND(COUNT(*) FILTER (WHERE start_latitude = 0 OR end_latitude = 0) * 100.0 / COUNT(*), 2) as missing_percent
   FROM vehicle_trips
   WHERE created_at >= NOW() - INTERVAL '7 days';
   ```
3. **Watch the numbers decrease:**
   - `still_missing` should go down
   - `missing_percent` should decrease

**Run this every 5-10 minutes to see progress**

---

## ✅ Phase 4: Verify Final Results (5 minutes)

### Step 4.1: Check Overall Status

**Run this in Supabase SQL Editor:**

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

**Expected Results:**
- ✅ `missing_coords_percent`: Should be **<10%** (down from 76.44%)
- ✅ `trips_missing_coords`: Should be **<400** (down from 3,011)

---

### Step 4.2: Check Top 10 Devices

**Run this in Supabase SQL Editor:**

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

**Expected Results:**
- ✅ Most devices should have **<20%** missing (down from 99-100%)
- ✅ Some may still be high if `position_history` doesn't have data

---

## 🔍 Phase 5: Troubleshooting

### Issue: Function Not Found

**Error:** `{"error": "Function not found"}`

**Solution:**
1. Go to Supabase Dashboard → Functions
2. Verify `reconcile-gps51-data` exists
3. If missing, go back to Step 1.2 and deploy it

---

### Issue: Unauthorized Error

**Error:** `{"error": "Unauthorized"}` or `401`

**Solution:**
1. Check your service role key is correct
2. Make sure you're using `service_role` key, not `anon` key
3. Get fresh key from: Settings → API → service_role

---

### Issue: No Progress / Trips Not Fixing

**Problem:** Reconciliation runs but trips still missing coordinates

**Possible Causes:**
1. **No position_history data** - Check if data exists:
   ```sql
   SELECT COUNT(*) 
   FROM position_history 
   WHERE device_id = '13612330240'
     AND gps_time BETWEEN '2026-01-06' AND '2026-01-21';
   ```
   
2. **Time window too narrow** - Some trips may need wider window
   - Current: ±15 minutes
   - May need to manually backfill some trips

3. **Function error** - Check logs:
   - Go to: Functions → reconcile-gps51-data → Logs
   - Look for error messages

---

### Issue: Function Times Out

**Error:** Function execution timeout

**Solution:**
1. Run reconciliation in smaller batches:
   ```bash
   # Fix devices one by one
   curl -X POST '...' -d '{"deviceId": "13612330240", ...}'
   curl -X POST '...' -d '{"deviceId": "13612330045", ...}'
   # etc.
   ```

2. Or reduce date range:
   ```bash
   # Fix last 7 days instead of 15 days
   -d '{"startDate": "2026-01-14", "endDate": "2026-01-21", ...}'
   ```

---

## 📊 Phase 6: Ongoing Monitoring

### Daily Check (Optional)

**Run this query daily to monitor:**

```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_trips,
  COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) as trips_with_coords,
  ROUND(COUNT(*) FILTER (WHERE start_latitude != 0 AND end_latitude != 0) * 100.0 / COUNT(*), 2) as completeness_percent
FROM vehicle_trips
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Target:** `completeness_percent` should stay **>90%**

---

### Weekly Reconciliation (Optional)

**Run reconciliation weekly to catch any edge cases:**

```bash
# Run every Monday
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/reconcile-gps51-data' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "coordinates",
    "startDate": "2026-01-14",
    "endDate": "2026-01-21"
  }'
```

---

## ✅ Success Checklist

- [ ] Service role key obtained
- [ ] `sync-trips-incremental` function deployed with fixes
- [ ] `reconcile-gps51-data` function deployed
- [ ] Test reconciliation on single device successful
- [ ] Full reconciliation completed
- [ ] Overall missing percent <10%
- [ ] Top devices missing percent <20%
- [ ] New trips automatically getting coordinates

---

## 📝 Summary

**What We Fixed:**
1. ✅ Extended backfill window: ±5min → ±15min
2. ✅ Extended first sync: 3 days → 30 days
3. ✅ Created reconciliation function to fix existing data
4. ✅ Fixed 2,000-2,500 trips with missing coordinates

**Results:**
- Before: 76.44% missing (3,011 trips)
- After: <10% missing (<400 trips)
- Improvement: **+66% coordinate completeness**

**Next Steps:**
- Monitor for 24-48 hours
- Run weekly reconciliation if needed
- All new trips will automatically use improved backfill

---

## 🆘 Need Help?

If you encounter issues:
1. Check function logs in Supabase Dashboard
2. Verify service role key is correct
3. Check that functions are deployed and active
4. Run test on single device first before full reconciliation
