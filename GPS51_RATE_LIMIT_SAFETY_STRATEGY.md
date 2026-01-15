# GPS51 Rate Limit Safety Strategy

## Problem
Getting `Error: GPS51 querytrips error: ip limit:178.62.14.85 (status: 8902)` when clicking sync.

## Root Cause
GPS51 API has strict rate limits. When too many requests are made too quickly, the IP gets temporarily blocked.

## Safety Measures Implemented

### 1. **Reduced Rate Limits** ✅
- **Before**: 5 calls/second
- **After**: 3 calls/second (MAX_CALLS_PER_SECOND: 3)
- **Delay**: 350ms between calls (MIN_DELAY_MS: 350)

### 2. **Extended Backoff Period** ✅
- **IP Limit Error (8902)**: 60 seconds backoff (1 minute)
- **Other Rate Limit Errors**: Exponential backoff (2s, 6s, 18s...)
- **Max Retry Delay**: 60 seconds (increased from 30s)

### 3. **Reduced Retry Attempts** ✅
- **Before**: 3 retries
- **After**: 2 retries (fails faster, prevents more calls)

### 4. **Device Processing Delays** ✅
- **1 second delay** between processing different devices
- Prevents simultaneous API calls for multiple devices

### 5. **Reduced Sync Date Range** ✅
- **Full Sync**: Last 3 days (reduced from 7 days)
- **Incremental Sync**: Since last sync (unchanged)
- Reduces number of API calls per sync

### 6. **Global Rate Limit State** ✅
- Database-backed rate limiting coordinates across all function instances
- Prevents multiple functions from making simultaneous calls
- Tracks backoff periods globally

## User-Facing Safety Features

### 1. **Sync Button Cooldown** (Recommended)
Add a cooldown period after sync to prevent rapid clicking:

```typescript
// In useTripSync.ts or OwnerVehicleProfile
const [lastSyncTime, setLastSyncTime] = useState<number>(0);
const SYNC_COOLDOWN_MS = 30000; // 30 seconds

const canSync = Date.now() - lastSyncTime > SYNC_COOLDOWN_MS;
```

### 2. **Error Message Improvements**
Show user-friendly messages when rate limited:

```typescript
if (error.message?.includes("8902") || error.message?.includes("ip limit")) {
  throw new Error("Rate limit reached. Please wait 1 minute before syncing again.");
}
```

### 3. **Sync Status Indicator**
Show when sync is in progress to prevent duplicate syncs.

## Best Practices for Users

### ✅ DO:
1. **Wait 1 minute** between sync attempts if you get a rate limit error
2. **Use incremental sync** (default) instead of full sync when possible
3. **Sync one vehicle at a time** if managing multiple vehicles
4. **Check sync status** before clicking sync again

### ❌ DON'T:
1. **Don't click sync multiple times rapidly**
2. **Don't sync multiple vehicles simultaneously**
3. **Don't use full sync frequently** (only when needed)
4. **Don't ignore rate limit errors** - wait before retrying

## Monitoring

### Check Rate Limit State
```sql
SELECT value, metadata, updated_at
FROM app_settings
WHERE key = 'gps51_rate_limit_state';
```

### Check Recent Sync Errors
```sql
SELECT device_id, sync_status, error_message, updated_at
FROM trip_sync_status
WHERE sync_status = 'error'
  AND updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;
```

## Emergency: If Rate Limited

1. **Wait 1-2 minutes** before trying again
2. **Check rate limit state** in database (see above)
3. **Clear backoff state** if needed:
   ```sql
   UPDATE app_settings
   SET value = '{"backoff_until": 0, "last_call_time": 0}'
   WHERE key = 'gps51_rate_limit_state';
   ```
4. **Reduce sync frequency** - use incremental syncs only

## Future Improvements

1. **Queue System**: Queue sync requests instead of rejecting them
2. **Smart Scheduling**: Automatically schedule syncs during low-activity periods
3. **Batch Processing**: Group multiple devices into single API calls if GPS51 supports it
4. **Caching**: Cache trip data to reduce API calls
5. **Webhook Integration**: Use GPS51 webhooks instead of polling (if available)
