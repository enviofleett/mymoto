# Verify Realtime is Working

## Status Check

✅ **Realtime is ENABLED** - `vehicle_positions` is in the `supabase_realtime` publication

## Next Steps

### 1. Check REPLICA IDENTITY

Run this SQL to verify REPLICA IDENTITY is set to FULL:

```sql
SELECT 
  c.relname AS tablename,
  CASE c.relreplident
    WHEN 'd' THEN 'DEFAULT (primary key only)'
    WHEN 'n' THEN 'NOTHING (no replica identity)'
    WHEN 'f' THEN 'FULL (all columns) ✅'
    WHEN 'i' THEN 'INDEX (specific index)'
  END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'vehicle_positions';
```

**If it's NOT 'FULL', run:**
```sql
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
```

### 2. Check Browser Console

After refreshing the vehicle profile page, check the console for:

1. **Subscription Status:**
   ```
   [Realtime] Subscription status for 358657105966092: SUBSCRIBED
   ```
   - Should show `SUBSCRIBED`
   - If `CHANNEL_ERROR` or `TIMED_OUT`, there's a connection issue

2. **Position Updates (when GPS syncs):**
   ```
   [Realtime] Position update received for 358657105966092: {...}
   [Realtime] Mapped data: {...}
   [Realtime] ✅ Cache updated and invalidated for 358657105966092
   ```

### 3. Test the Update

1. **Refresh the page** - Check console for subscription status
2. **Wait for GPS sync** - Or manually trigger GPS sync
3. **Watch console** - Should see position update logs
4. **Check map** - Location marker should move instantly
5. **Check timestamp** - "Updated" time should refresh

### 4. If Updates Appear But Map Doesn't Move

The map component should react to prop changes automatically. If it doesn't:

1. Check if `latitude` and `longitude` props are actually changing
2. Verify React is re-rendering (check React DevTools)
3. Check for any errors in console

## Enhanced Debugging

I've enhanced the realtime hook with:
- ✅ Detailed payload logging
- ✅ REPLICA IDENTITY verification
- ✅ Cache invalidation to force UI updates
- ✅ Better error messages

## Common Issues

### Issue: Subscription shows SUBSCRIBED but no updates
**Solution:** 
- Check if GPS sync job is running
- Verify `vehicle_positions` table is being updated
- Check WebSocket connection in Network tab

### Issue: Updates appear in console but map doesn't move
**Solution:**
- Check if coordinates are actually changing
- Verify React Query cache is updating
- Check for React rendering issues

### Issue: REPLICA IDENTITY is not FULL
**Solution:**
```sql
ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;
```
