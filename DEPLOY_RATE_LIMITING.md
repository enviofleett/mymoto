# Deploy GPS51 Rate Limiting - Step by Step

## ✅ What's Been Done

1. ✅ Created centralized GPS51 client (`_shared/gps51-client.ts`)
2. ✅ Updated `sync-trips-incremental` to use shared client
3. ✅ Updated `gps-data` to use shared client
4. ✅ Created migrations to reduce cron frequency

## 🚀 Deployment Steps

### Step 1: Deploy Shared Client

The shared client is automatically included when you deploy any function that imports it. No separate deployment needed.

### Step 2: Deploy Updated Functions

#### A. Deploy sync-trips-incremental

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `sync-trips-incremental`
3. Copy code from: `supabase/functions/sync-trips-incremental/index.ts`
4. Paste and deploy

#### B. Deploy gps-data

1. Go to: https://supabase.com/dashboard/project/cmvpnsqiefbsqkwnraka/functions
2. Click on `gps-data`
3. Copy code from: `supabase/functions/gps-data/index.ts`
4. Paste and deploy

**Note:** The shared client (`_shared/gps51-client.ts`) will be automatically available to these functions.

### Step 3: Run Migrations

Run these SQL migrations in Supabase SQL Editor:

#### Migration 1: Reduce Cron Frequency
```sql
-- File: supabase/migrations/20260114000000_reduce_cron_frequency.sql
-- Copy and run the entire file
```

#### Migration 2: Rate Limit State Documentation
```sql
-- File: supabase/migrations/20260114000001_create_rate_limit_state.sql
-- Copy and run the entire file
```

### Step 4: Verify Deployment

1. **Check Function Logs:**
   - Go to Functions → `sync-trips-incremental` → Logs
   - Look for: `[GPS51 Client]` log messages
   - Should see rate limiting in action

2. **Test Rate Limiting:**
   - Invoke `sync-trips-incremental` for multiple devices
   - Check logs for rate limiting delays
   - Verify no IP limit errors (8902)

3. **Check Cron Jobs:**
   - Run: `SELECT * FROM cron.job WHERE jobname LIKE '%sync%'`
   - Verify schedules are updated

## 📊 Monitoring

### Check Rate Limit State

```sql
SELECT 
  key,
  value,
  metadata,
  updated_at
FROM app_settings
WHERE key = 'gps51_rate_limit_state';
```

### Check for Rate Limit Errors

```sql
SELECT 
  action,
  response_status,
  error_message,
  created_at
FROM gps_api_logs
WHERE response_status = 8902
  OR error_message LIKE '%8902%'
  OR error_message LIKE '%ip limit%'
ORDER BY created_at DESC
LIMIT 20;
```

### Monitor API Call Frequency

```sql
SELECT 
  action,
  COUNT(*) as call_count,
  MIN(created_at) as first_call,
  MAX(created_at) as last_call
FROM gps_api_logs
WHERE created_at >= now() - interval '1 hour'
GROUP BY action
ORDER BY call_count DESC;
```

## 🔧 Configuration

### Adjust Rate Limits (if needed)

Edit `supabase/functions/_shared/gps51-client.ts`:

```typescript
const GPS51_RATE_LIMIT = {
  MAX_CALLS_PER_SECOND: 5,        // Adjust if needed
  MIN_DELAY_MS: 200,              // Adjust if needed
  MAX_BURST_CALLS: 5,             // Adjust if needed
  // ...
};
```

### Adjust Cron Frequency (if needed)

Edit `supabase/migrations/20260114000000_reduce_cron_frequency.sql`:

```sql
-- Change '*/5 * * * *' to your desired frequency
-- Examples:
-- '*/10 * * * *' = every 10 minutes
-- '0 * * * *' = every hour
```

## ⚠️ Troubleshooting

### If Still Getting Rate Limit Errors

1. **Check if migrations ran:**
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%sync%';
   ```

2. **Check rate limit state:**
   ```sql
   SELECT * FROM app_settings WHERE key = 'gps51_rate_limit_state';
   ```

3. **Reduce rate limits further:**
   - Increase `MIN_DELAY_MS` to 500ms (2 calls/sec)
   - Reduce `MAX_BURST_CALLS` to 3

4. **Check for other functions calling GPS51:**
   - `gps-history-backfill` (not updated yet)
   - `gps-auth` (not updated yet)
   - `gps51-user-auth` (not updated yet)

### If Functions Fail to Import Shared Client

1. **Check import path:**
   - Should be: `../_shared/gps51-client.ts`
   - Verify `_shared` directory exists

2. **Verify file structure:**
   ```
   supabase/functions/
     _shared/
       gps51-client.ts
     sync-trips-incremental/
       index.ts
   ```

## 📝 Next Steps (Optional)

1. Update remaining functions:
   - `gps-history-backfill`
   - `gps-auth`
   - `gps51-user-auth`
   - `execute-vehicle-command`

2. Add monitoring dashboard:
   - Track rate limit errors
   - Monitor API call frequency
   - Alert on persistent rate limiting

3. Add request queuing (if needed):
   - Only if rate limiting isn't sufficient
   - Queue requests when rate limit is hit

## ✅ Success Criteria

After deployment, you should see:
- ✅ No IP limit errors (8902) in logs
- ✅ Rate limiting delays in function logs
- ✅ Reduced API call frequency
- ✅ Automatic retry on rate limit errors
- ✅ Backoff periods in `app_settings`
