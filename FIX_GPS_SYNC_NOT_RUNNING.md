# Fix: GPS Sync Job Not Running

## Problem

- **Expected**: GPS sync runs every 5 minutes
- **Actual**: Data was last updated 42 minutes ago
- **Result**: Location stuck, no realtime updates

## Root Cause

The GPS sync cron job (`sync-gps-data`) is either:
1. **Not scheduled** - Job doesn't exist
2. **Disabled** - Job exists but `active = false`
3. **Failing** - Job runs but errors (check `cron.job_run_details`)
4. **Missing credentials** - Service role key not configured

## Solution

### Step 1: Check Cron Job Status

Run this SQL to see if the job exists and is active:

```sql
SELECT 
  jobid,
  schedule,
  active,
  jobname
FROM cron.job
WHERE jobname = 'sync-gps-data';
```

**Expected result:**
- `schedule` should be `*/5 * * * *` (every 5 minutes)
- `active` should be `true`

### Step 2: Check Execution History

```sql
SELECT 
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-gps-data')
ORDER BY start_time DESC
LIMIT 10;
```

Look for:
- `status = 'failed'` → Check `return_message` for errors
- `status = 'succeeded'` → Job is running but might be failing silently
- No recent runs → Job isn't executing

### Step 3: Check Service Role Key

The cron job needs the service role key to authenticate:

```sql
SELECT 
  name,
  setting,
  source
FROM pg_settings
WHERE name LIKE '%supabase_service_role_key%';
```

**If not set**, configure it:

1. Get your service role key from Supabase Dashboard → Settings → API
2. Run:
```sql
ALTER DATABASE postgres SET "app.settings.supabase_service_role_key" = 'your-service-role-key-here';
```

### Step 4: Manually Trigger Sync (Test)

To test if the sync works, manually invoke the Edge Function:

**Option A: Via Supabase Dashboard**
- Go to Edge Functions → `gps-data` → Invoke
- Body: `{"action": "lastposition", "use_cache": false}`

**Option B: Via SQL**
```sql
SELECT net.http_post(
  url := 'https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/gps-data',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
  ),
  body := jsonb_build_object(
    'action', 'lastposition',
    'use_cache', false
  )
) AS request_id;
```

After running, check if `cached_at` updates:
```sql
SELECT cached_at, EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
```

### Step 5: Re-schedule Cron Job (If Missing)

If the job doesn't exist, create it:

```sql
SELECT cron.schedule(
  'sync-gps-data',
  '*/5 * * * *', -- Every 5 minutes
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
        'use_cache', true
      )
    ) AS request_id;
  $$
);
```

## Expected Behavior After Fix

1. **Cron job runs every 5 minutes**
2. **Database updates** → `cached_at` refreshes
3. **Realtime event fires** → Browser receives update
4. **Location updates** → Map marker moves
5. **Timestamp refreshes** → "Updated" time changes

## Verification

After fixing, wait 5 minutes and check:

```sql
SELECT 
  cached_at,
  EXTRACT(EPOCH FROM (NOW() - cached_at)) / 60 AS minutes_ago
FROM vehicle_positions
WHERE device_id = '358657105966092';
```

`minutes_ago` should be < 5 minutes if the job is working.
