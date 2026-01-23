# Check Edge Function Logs

## Problem

- Cron job is running successfully ✅
- Database not updating ❌
- Data is 42 minutes old ❌

## Possible Causes

1. **Cache returning stale data** - Function returns cached data without updating
2. **GPS51 API returning no records** - Device not in response
3. **Silent failures** - Errors being swallowed

## How to Check

### Step 1: Check Edge Function Logs

Go to **Supabase Dashboard** → **Edge Functions** → **gps-data** → **Logs**

Look for recent logs (last 10 minutes). You should see:

**If cache is being used:**
```
Returning cached positions: X
```

**If GPS51 is being called:**
```
Token retrieved: serverid=..., username=...
Fetching device IDs from querymonitorlist...
Found device IDs: X
Syncing positions: X
Updated X positions
```

**If there are errors:**
```
GPS Data Error: ...
GPS51 API call error: ...
```

### Step 2: Check if Device is in GPS51 Response

The function only updates devices that are in the GPS51 API response. If your device `358657105966092` is:
- **Offline** in GPS51
- **Not in the device list** returned by querymonitorlist
- **Not in the lastposition response**

Then it won't be updated.

### Step 3: Test Manually Without Cache

Manually invoke the function to bypass cache:

**Via Supabase Dashboard:**
- Edge Functions → `gps-data` → Invoke
- Body:
```json
{
  "action": "lastposition",
  "use_cache": false
}
```

**Watch the logs** - you should see:
- GPS51 API call
- Device IDs fetched
- Positions synced
- Database updated

### Step 4: Check if Device is Online in GPS51

The device might be offline in GPS51, so it won't appear in the lastposition response.

## Expected Logs

When working correctly, you should see:

```
Token retrieved: serverid=..., username=...
Using device IDs from database: X
Syncing positions: X
Updated X positions (Y moving)
```

If you see "Returning cached positions" repeatedly, the cache logic might be broken.

## Quick Fix

If cache is the issue, the cron job should use `use_cache: false` to force updates:

```sql
-- Update cron job to bypass cache
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
        'use_cache', false  -- Force update, don't use cache
      )
    ) AS request_id;
  $$
);
```
