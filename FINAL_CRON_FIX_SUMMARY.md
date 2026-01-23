# Final Cron Job Fix

## Problem

The GPS sync cron job is configured with `use_cache: true`, which causes:
- Function returns cached data without calling GPS51 API
- Database never gets updated
- Realtime events never fire
- Location stays stuck

## Solution

Run this SQL to fix the cron job:

```sql
SELECT cron.unschedule('sync-gps-data');

SELECT cron.schedule(
  'sync-gps-data',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
      ),
      body := jsonb_build_object(
        'action', 'lastposition',
        'use_cache', false  -- Force GPS51 API call
      )
    ) AS request_id;
  $$
);
```

## What Changes

**Before:**
- Cron runs → Checks cache → Returns cached data → Database not updated

**After:**
- Cron runs → Calls GPS51 API → Gets fresh data → Updates database → Realtime fires → Location updates

## Verification Steps

1. **Run the SQL fix above**

2. **Verify job was created:**
```sql
SELECT 
  jobname,
  active,
  CASE 
    WHEN command LIKE '%use_cache%false%' THEN '✅ Fixed'
    ELSE '❌ Still using cache'
  END as status
FROM cron.job
WHERE jobname = 'sync-gps-data';
```

3. **Wait 5 minutes** for next cron run

4. **Check database updated:**
```sql
SELECT 
  cached_at,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
```
Should show < 5 minutes

5. **Check browser console** - should see:
```
[Realtime] Position update received for 358657105966092
[Realtime] ✅ Cache updated and invalidated
[VehicleLocationMap] Coordinates changed
```

## Expected Timeline

- **T+0**: Run SQL fix
- **T+5min**: Cron runs → GPS51 API called → Database updated
- **T+5min**: Realtime event fires → Browser receives update
- **T+5min**: Location updates on map instantly

This fix ensures the cron job always calls GPS51 API and updates the database, which triggers Realtime events for instant location updates.
