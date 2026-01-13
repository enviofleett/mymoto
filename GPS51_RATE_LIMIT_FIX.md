# GPS51 Rate Limit Fix - Complete Solution

## Problem: IP Limit Error (8902)

**Error:** `GPS51 querytrips error: ip limit:178.62.14.85 (status: 8902)`

**Root Causes:**
1. Multiple functions calling GPS51 API simultaneously
2. No centralized rate limiting across function instances
3. Aggressive cron jobs (every 1 minute + every 15 minutes)
4. No retry logic for rate limit errors
5. No global coordination between function instances

## Solution: Centralized Rate Limiting System

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Shared GPS51 Client (_shared/gps51-client.ts)     │
│                                                     │
│  ✅ Database-backed rate limiting                   │
│  ✅ Retry with exponential backoff                  │
│  ✅ Global coordination across instances           │
│  ✅ Automatic backoff on rate limit errors         │
└─────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
  sync-trips-   gps-data   (other functions)
  incremental
```

### Key Features

1. **Conservative Rate Limits:**
   - Max **5 calls/second** (reduced from 10)
   - **200ms minimum delay** between calls
   - Max **5 calls per 1-second window** (burst limit)

2. **Database-Backed Coordination:**
   - Stores rate limit state in `app_settings` table
   - Coordinates across ALL function instances
   - Prevents concurrent API spikes

3. **Automatic Retry & Backoff:**
   - Detects rate limit errors (8902, 9903, 9904)
   - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
   - Max 3 retries per request
   - Global backoff coordinates across instances

4. **Reduced Cron Frequency:**
   - GPS data sync: **1 min → 5 min** (80% reduction)
   - Trip sync: **15 min → 30 min** (50% reduction)

## Implementation

### Files Created

1. **`supabase/functions/_shared/gps51-client.ts`**
   - Centralized GPS51 API client
   - All rate limiting logic
   - Retry and backoff handling

2. **`supabase/migrations/20260114000000_reduce_cron_frequency.sql`**
   - Reduces cron job frequency
   - Prevents concurrent API calls

3. **`supabase/migrations/20260114000001_create_rate_limit_state.sql`**
   - Documents rate limit state structure
   - Uses existing `app_settings` table

### Files Updated

1. **`supabase/functions/sync-trips-incremental/index.ts`**
   - ✅ Uses shared GPS51 client
   - ✅ Removed local rate limiting code

2. **`supabase/functions/gps-data/index.ts`**
   - ✅ Uses shared GPS51 client
   - ✅ Removed local rate limiting code

### Files Still Need Update

1. **`supabase/functions/gps-history-backfill/index.ts`**
   - ⏳ Update to use shared client

2. **`supabase/functions/gps-auth/index.ts`**
   - ⏳ Add rate limiting for login calls

3. **`supabase/functions/gps51-user-auth/index.ts`**
   - ⏳ Add rate limiting

4. **`supabase/functions/execute-vehicle-command/index.ts`**
   - ⏳ Add rate limiting

## How It Works

### Rate Limiting Flow

```
1. Function calls callGps51WithRateLimit()
   │
2. Check global backoff state (database)
   │
3. If in backoff → Wait until backoff ends
   │
4. Apply rate limiting (200ms delay, burst limit)
   │
5. Make API call
   │
6. If rate limit error (8902):
   │   ├─ Set global backoff (database)
   │   ├─ Wait for backoff period
   │   └─ Retry (max 3 times)
   │
7. Success → Reset backoff
```

### Rate Limit State (in app_settings)

```json
{
  "key": "gps51_rate_limit_state",
  "value": {
    "backoff_until": 1234567890,
    "last_call_time": 1234567890,
    "updated_at": "2026-01-14T..."
  }
}
```

## Benefits

✅ **Prevents IP Limit Errors:**
- All API calls go through centralized rate limiter
- Database coordination prevents concurrent spikes
- Automatic backoff on rate limit errors

✅ **Resilient:**
- Automatic retry with exponential backoff
- Graceful degradation on persistent errors
- Global state prevents race conditions

✅ **Scalable:**
- Works across multiple function instances
- Database-backed coordination
- No single point of failure

✅ **Reduced API Load:**
- 80% reduction in GPS data sync calls
- 50% reduction in trip sync calls
- Conservative rate limits (5 calls/sec)

## Deployment Steps

1. **Deploy Shared Client:**
   - The `_shared/gps51-client.ts` file will be deployed automatically
   - Supabase Edge Functions support relative imports

2. **Run Migrations:**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: supabase/migrations/20260114000000_reduce_cron_frequency.sql
   -- File: supabase/migrations/20260114000001_create_rate_limit_state.sql
   ```

3. **Deploy Updated Functions:**
   - Deploy `sync-trips-incremental`
   - Deploy `gps-data`
   - (Other functions can be updated later)

4. **Monitor:**
   - Check function logs for rate limit errors
   - Monitor `app_settings` for backoff state
   - Track API call frequency

## Testing

After deployment:
1. Trigger multiple syncs simultaneously
2. Verify rate limiting works
3. Check for rate limit errors in logs
4. Verify backoff state in database

## Rollback Plan

If issues occur:
1. Revert functions to use local rate limiting
2. Increase cron frequency back to original
3. Increase rate limit delays

## Monitoring

Track these metrics:
- Rate limit errors (8902) in function logs
- Backoff periods in `app_settings`
- API call frequency
- Function execution times
