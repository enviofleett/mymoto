# Next Steps: Sync Official Reports Function

## ✅ What's Complete

- ✅ Function code implemented (`supabase/functions/sync-official-reports/index.ts`)
- ✅ Configuration updated (`supabase/config.toml`)
- ✅ Documentation created (`SYNC_OFFICIAL_REPORTS_IMPLEMENTATION.md`)

## 🚀 Immediate Next Steps

### Step 1: Deploy the Function

**Option A: Via Supabase CLI (Recommended)**

```bash
cd /Users/alli/mymoto/fleet-heartbeat-dashboard-6f37655e
supabase functions deploy sync-official-reports
```

**Option B: Via Supabase Dashboard**

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click **"Deploy a new function"** or **"Create Function"**
3. Function name: `sync-official-reports`
4. Copy code from: `supabase/functions/sync-official-reports/index.ts`
5. Paste and deploy

**Option C: Verify JWT is disabled**

The function should have `verify_jwt = false` in `config.toml` (already set). If deploying via dashboard, make sure to disable JWT verification in function settings.

---

### Step 2: Test the Function

**Test with a real device:**

```bash
curl -X POST 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/sync-official-reports' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "device_id": "358657105966092",
    "date": "2026-01-26"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "device_id": "358657105966092",
  "date": "2026-01-26",
  "trips": {
    "fetched": 5,
    "upserted": 5
  },
  "mileage": {
    "fetched": 1,
    "upserted": 1
  },
  "duration_ms": 1234
}
```

---

### Step 3: Verify Data in Database

**Check trips synced:**
```sql
SELECT 
  COUNT(*) as trip_count,
  SUM(distance_km) as total_distance_km,
  AVG(avg_speed) as avg_speed_kmh,
  MIN(start_time) as first_trip,
  MAX(end_time) as last_trip
FROM vehicle_trips
WHERE device_id = '358657105966092'
  AND DATE(start_time) = '2026-01-26';
```

**Check mileage synced:**
```sql
SELECT 
  statisticsday,
  totaldistance as distance_meters,
  totaldistance / 1000.0 as distance_km,
  runoilper100km,
  avgspeed as avg_speed_kmh
FROM vehicle_mileage_details
WHERE device_id = '358657105966092'
  AND statisticsday = '2026-01-26';
```

---

### Step 4: Compare with GPS51 Platform

1. **Log into GPS51 platform** for the same device and date
2. **Compare trip counts** - Should match exactly
3. **Compare distances** - Should match exactly
4. **Compare mileage stats** - Should match exactly

If there are discrepancies, check:
- Date format/timezone handling
- Speed normalization
- Distance calculations

---

## 🔄 Integration Options

### Option A: Manual Sync (On-Demand)

Add a button in the frontend to trigger sync:

```typescript
// In OwnerVehicleProfile or similar component
const handleSyncOfficialData = async () => {
  const { data, error } = await supabase.functions.invoke('sync-official-reports', {
    body: {
      device_id: deviceId,
      date: new Date().toISOString().split('T')[0], // Today's date
    },
  });
  
  if (error) {
    console.error('Sync failed:', error);
    // Show error toast
  } else {
    console.log('Sync successful:', data);
    // Refresh data, show success toast
  }
};
```

### Option B: Automatic Sync (CRON Job)

Set up a scheduled sync via Supabase CRON:

```sql
-- Sync official reports daily at 2 AM (after GPS51 processes previous day)
SELECT cron.schedule(
  'sync-official-reports-daily',
  '0 2 * * *', -- 2 AM daily
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-official-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
    ),
    body := jsonb_build_object(
      'device_id', v.device_id,
      'date', (CURRENT_DATE - INTERVAL '1 day')::text -- Yesterday's date
    )
  )
  FROM (
    SELECT DISTINCT device_id 
    FROM vehicle_positions 
    WHERE last_synced_at > NOW() - INTERVAL '7 days' -- Only active devices
  ) v;
  $$
);
```

**Note:** This would sync all active devices. For a single device, modify the query.

### Option C: Backfill Historical Data

Create a script to sync historical data:

```typescript
// scripts/backfill-official-reports.ts
const deviceId = '358657105966092';
const startDate = new Date('2026-01-01');
const endDate = new Date('2026-01-26');

for (let date = startDate; date <= endDate; date.setDate(date.getDate() + 1)) {
  const dateStr = date.toISOString().split('T')[0];
  console.log(`Syncing ${dateStr}...`);
  
  const { data, error } = await supabase.functions.invoke('sync-official-reports', {
    body: {
      device_id: deviceId,
      date: dateStr,
    },
  });
  
  if (error) {
    console.error(`Failed for ${dateStr}:`, error);
  } else {
    console.log(`✅ ${dateStr}: ${data.trips.upserted} trips, ${data.mileage.upserted} mileage`);
  }
  
  // Rate limit: wait 1 second between requests
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

---

## 🎯 Recommended Workflow

1. **Deploy** the function (Step 1)
2. **Test** with one device/date (Step 2)
3. **Verify** data matches GPS51 (Step 3 & 4)
4. **Add frontend button** for on-demand sync (Option A)
5. **Set up daily CRON** for automatic sync (Option B)
6. **Backfill** historical data if needed (Option C)

---

## 🔍 Troubleshooting

### Error: "Missing DO_PROXY_URL"
- Check environment variables in Supabase Dashboard
- Settings → Edge Functions → Environment Variables
- Ensure `DO_PROXY_URL` is set

### Error: "GPS51 querytrips error"
- Check GPS51 API credentials
- Verify device_id exists in GPS51
- Check date format (must be YYYY-MM-DD)

### No trips/mileage returned
- Verify device had activity on that date
- Check GPS51 platform directly
- Try a different date with known activity

### Data doesn't match GPS51
- Check timezone handling (GPS51 uses GMT+8)
- Verify speed normalization
- Compare distance calculations

---

## 📊 Success Criteria

✅ Function deploys without errors  
✅ Test request returns success response  
✅ Trips appear in `vehicle_trips` table  
✅ Mileage appears in `vehicle_mileage_details` table  
✅ Data matches GPS51 platform exactly  
✅ Frontend can trigger sync on-demand  
✅ CRON job runs automatically (if configured)  

---

## 🚦 Priority Order

1. **HIGH**: Deploy and test (Steps 1-3)
2. **MEDIUM**: Compare with GPS51 (Step 4)
3. **MEDIUM**: Add frontend integration (Option A)
4. **LOW**: Set up CRON automation (Option B)
5. **LOW**: Backfill historical data (Option C)

---

## 📝 Notes

- The function is **idempotent** - safe to run multiple times
- Uses **upsert** to prevent duplicates
- Handles **empty responses** gracefully (no error if no data)
- **Batch processing** for efficiency (50 records at a time)
- **Error resilient** - continues even if one part fails

---

**Ready to proceed?** Start with Step 1 (Deploy) and work through the steps sequentially.
