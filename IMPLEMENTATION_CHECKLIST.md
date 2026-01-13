# GPS51 Rate Limiting Implementation Checklist

## ✅ Completed

1. ✅ Created shared GPS51 client (`_shared/gps51-client.ts`)
   - Database-backed rate limiting
   - Retry logic with exponential backoff
   - Global coordination across function instances

2. ✅ Updated `sync-trips-incremental` function
   - Uses shared GPS51 client
   - Removed local rate limiting code

3. ✅ Updated `gps-data` function
   - Uses shared GPS51 client
   - Removed local rate limiting code

4. ✅ Created migration to reduce cron frequency
   - GPS data sync: 1 min → 5 min (80% reduction)
   - Trip sync: 15 min → 30 min (50% reduction)

## ⏳ Remaining Tasks

### High Priority

1. ⏳ Update `gps-history-backfill` function
   - Replace `callGps51` with shared client
   - Add rate limiting

2. ⏳ Update `gps-auth` function
   - Add rate limiting for login calls
   - Use shared client if possible

3. ⏳ Update `gps51-user-auth` function
   - Add rate limiting for login and querymonitorlist calls

4. ⏳ Update `execute-vehicle-command` function
   - Add rate limiting for command calls

### Medium Priority

5. ⏳ Add monitoring/alerting
   - Log rate limit errors (8902)
   - Alert on persistent rate limiting
   - Track API call frequency

6. ⏳ Test rate limiting
   - Test with multiple concurrent calls
   - Verify backoff works correctly
   - Test retry logic

### Low Priority

7. ⏳ Add request queuing (if needed)
   - Only if rate limiting isn't sufficient
   - Queue requests when rate limit is hit

## Rate Limiting Configuration

Current settings (conservative):
- Max 5 calls/second
- 200ms minimum delay
- Max 5 calls per 1-second window
- 3 retries with exponential backoff
- Max 30s backoff delay

## Testing

After deployment, monitor:
1. GPS51 API logs for rate limit errors
2. Backoff periods in app_settings
3. Function execution times
4. API call frequency

## Rollback Plan

If issues occur:
1. Revert to local rate limiting in each function
2. Increase cron frequency back to original
3. Increase rate limit delays
