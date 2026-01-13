# GPS51 Rate Limiting Architecture

## Problem Analysis

### Root Cause: IP Limit Error (8902)
The error `GPS51 querytrips error: ip limit:178.62.14.85 (status: 8902)` occurs when:
1. **Multiple functions call GPS51 API simultaneously**
2. **No centralized rate limiting** across function instances
3. **Cron jobs trigger concurrent API calls**
4. **No retry logic** for rate limit errors

### Current Issues Found

1. **Multiple GPS51 API Clients:**
   - `sync-trips-incremental` - Has rate limiting (100ms delay) ✅
   - `gps-data` - NO rate limiting ❌
   - `gps-history-backfill` - NO rate limiting ❌
   - `gps-auth` - NO rate limiting ❌
   - `gps51-user-auth` - NO rate limiting ❌
   - `execute-vehicle-command` - NO rate limiting ❌

2. **Concurrent Cron Jobs:**
   - `sync-gps-data` runs every **1 minute** (calls `gps-data`)
   - `auto-sync-trips-15min` runs every **15 minutes** (calls `sync-trips-incremental`)
   - Both can run simultaneously, causing spikes

3. **No Global Coordination:**
   - Each function has its own `callGps51` function
   - Rate limiting is per-function, not global
   - Multiple function instances can call API simultaneously

## Solution: Centralized Rate Limiting

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│         Shared GPS51 Client (_shared/gps51-client.ts)   │
│                                                          │
│  Features:                                               │
│  - Database-backed rate limiting (global coordination)  │
│  - Retry logic with exponential backoff                  │
│  - Request queuing                                       │
│  - Automatic backoff on rate limit errors               │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Used by all functions
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ sync-trips-  │  │   gps-data   │  │ gps-history- │
│ incremental  │  │              │  │ backfill     │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Rate Limiting Strategy

1. **Conservative Limits:**
   - Max 5 calls/second (reduced from 10)
   - 200ms minimum delay between calls
   - Max 5 calls per 1-second window (burst limit)

2. **Database-Backed Coordination:**
   - Stores rate limit state in `app_settings` table
   - Coordinates across all function instances
   - Prevents concurrent spikes

3. **Automatic Backoff:**
   - On rate limit error (8902), sets backoff period
   - Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
   - Global backoff coordinates across instances

4. **Retry Logic:**
   - Automatically retries on rate limit errors
   - Max 3 retries with exponential backoff
   - Fails gracefully after max retries

### Implementation Steps

1. ✅ Create shared GPS51 client (`_shared/gps51-client.ts`)
2. ⏳ Update all functions to use shared client
3. ⏳ Reduce cron job frequency
4. ⏳ Add monitoring and alerts

### Rate Limit Configuration

```typescript
const GPS51_RATE_LIMIT = {
  MAX_CALLS_PER_SECOND: 5,        // Conservative limit
  MIN_DELAY_MS: 200,              // 200ms = 5 calls/sec
  BURST_WINDOW_MS: 1000,          // 1 second window
  MAX_BURST_CALLS: 5,             // Max 5 calls in 1 sec
  MAX_RETRIES: 3,                 // Retry 3 times
  INITIAL_RETRY_DELAY_MS: 1000,   // Start with 1s
  MAX_RETRY_DELAY_MS: 30000,      // Max 30s backoff
  BACKOFF_MULTIPLIER: 2,          // Double each retry
  RATE_LIMIT_ERROR_CODES: [8902, 9903, 9904],
};
```

### Benefits

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

### Monitoring

Track rate limit events:
- Log all rate limit errors (8902)
- Monitor backoff periods
- Alert on persistent rate limiting
- Track API call frequency
