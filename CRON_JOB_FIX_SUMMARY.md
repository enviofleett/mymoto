# Cron Job Fix Summary

## Problem Identified

The GPS sync cron job is configured with `use_cache: true`, which means:

1. **Function checks cache first** (line 514-522 in gps-data/index.ts)
2. **If cache is valid (< 30 seconds old)**, it returns cached data **WITHOUT** calling GPS51 API
3. **Database never gets updated** because GPS51 API is never called

Even though your data is 42 minutes old, the cache logic might be preventing updates.

## Solution

Update the cron job to use `use_cache: false` to force GPS51 API calls:

```sql
-- Run this SQL to fix the cron job
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
        'use_cache', false  -- Force update
      )
    ) AS request_id;
  $$
);
```

## What This Fixes

**Before:**
- Cron runs → Function checks cache → Returns cached data → Database not updated

**After:**
- Cron runs → Function calls GPS51 API → Gets fresh data → Updates database → Realtime event fires → Location updates

## Verification

After running the fix:

1. **Wait 5 minutes** for next cron run
2. **Check database:**
```sql
SELECT cached_at, EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
```
Should show < 5 minutes

3. **Check browser console** - should see:
```
[Realtime] Position update received for 358657105966092
[Realtime] ✅ Cache updated and invalidated
[VehicleLocationMap] Coordinates changed
```

4. **Check Edge Function logs** - should see:
```
Syncing positions: X
Updated X positions
```

## Expected Timeline

- **T+0**: Run SQL fix
- **T+5min**: Next cron run → GPS51 API called → Database updated
- **T+5min**: Realtime event fires → Browser receives update
- **T+5min**: Location updates on map

The fix ensures the cron job always calls GPS51 API and updates the database, which will trigger Realtime events and update the location in realtime.
