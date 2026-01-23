# Testing Guide - Phase 1 Fixes

**Version**: 1.0  
**Date**: 2024-01-23  
**Scope**: Realtime System Critical Fixes

---

## Prerequisites

Before testing, ensure:

- [ ] Dev server is running (`npm run dev` on port 8081)
- [ ] Supabase realtime is enabled for `vehicle_positions` table
- [ ] You have a test vehicle with active GPS data
- [ ] Chrome DevTools is open (for memory profiling)

---

## Test Suite 1: Memory Leak Fix

**Objective**: Verify no memory leaks on rapid navigation

### Steps:

1. **Open Chrome DevTools** → Performance tab → Memory
2. **Take heap snapshot** (baseline)
3. **Navigate to vehicle profile page** (any vehicle with deviceId)
4. **Perform 10 rapid navigations**:
   - Click vehicle → wait 2s → back button
   - Repeat 10 times
5. **Take another heap snapshot**
6. **Compare snapshots**:
   - Look for detached DOM nodes
   - Check for increasing subscription objects
   - Verify channel cleanup

### Expected Results:

✅ **PASS**: 
- Heap size increase < 5MB after 10 navigations
- No detached DOM nodes related to Supabase channels
- Console shows "Subscription closed" on each navigation

❌ **FAIL**: 
- Heap size increases by >10MB
- Console errors about unsubscribe failures
- Detached nodes keep growing

### Debug:

```javascript
// Run in console to check active channels
console.log('Active channels:', window.supabase?.getChannels?.());
// Should be empty after navigating away
```

---

## Test Suite 2: Double Re-render Fix

**Objective**: Verify reduced re-renders on position updates

### Steps:

1. **Install React DevTools Profiler** extension
2. **Navigate to vehicle profile page**
3. **Start profiling** in React DevTools
4. **Trigger position update** (manual DB update or wait for realtime):
   ```sql
   UPDATE vehicle_positions 
   SET latitude = latitude + 0.0001, 
       longitude = longitude + 0.0001,
       gps_time = NOW()
   WHERE device_id = 'YOUR_DEVICE_ID';
   ```
5. **Stop profiling** after 1 update
6. **Analyze render count** for ProfileHeader component

### Expected Results:

✅ **PASS**:
- ProfileHeader renders **1 time** per position update
- Console shows single "Cache updated" log
- No "invalidateQueries" logs after setQueryData

❌ **FAIL**:
- ProfileHeader renders **2+ times** per update
- Console shows both setQueryData and invalidateQueries logs

### Debug:

```javascript
// Check React Query DevTools
// Should show single update, not invalidation + refetch
```

---

## Test Suite 3: Auto-Sync Cooldown

**Objective**: Verify auto-sync respects 5-minute cooldown

### Steps:

1. **Clear sessionStorage**: 
   ```javascript
   sessionStorage.clear();
   ```
2. **Navigate to vehicle profile page**
3. **Check console** for "Auto-syncing trips on page load"
4. **Immediately navigate back** and return to same vehicle page
5. **Check console** - should show "Skipping auto-sync - cooldown active"
6. **Wait 6 minutes** (or cheat by clearing sessionStorage)
7. **Refresh page** - should auto-sync again

### Expected Results:

✅ **PASS**:
- First visit: Sync happens
- Immediate revisit: "cooldown active" message, no sync
- After 5 min: Sync happens again
- sessionStorage key `vehicle-sync-{deviceId}` exists

❌ **FAIL**:
- Every page visit triggers sync
- No "cooldown active" message
- sessionStorage not being set

### Debug:

```javascript
// Check sessionStorage
Object.keys(sessionStorage).filter(k => k.startsWith('vehicle-sync-'));
// Should show timestamp
```

---

## Test Suite 4: Pull-to-Refresh Race Condition

**Objective**: Verify fresh data always shown after pull-to-refresh

### Steps:

1. **Navigate to vehicle profile page**
2. **Note current trip count** in Reports section
3. **Create new trip in database** (or wait for real trip):
   ```sql
   INSERT INTO vehicle_trips (device_id, start_time, end_time, ...)
   VALUES ('YOUR_DEVICE_ID', NOW() - INTERVAL '1 hour', NOW(), ...);
   ```
4. **Pull down to refresh** on mobile (or click refresh button)
5. **Wait for "Refreshed" toast**
6. **Check trip count** - should include new trip

### Expected Results:

✅ **PASS**:
- Toast shows "Latest data loaded"
- New trip appears immediately
- No stale data shown
- Console shows sync → delay → invalidateQueries sequence

❌ **FAIL**:
- New trip doesn't appear
- Toast shows "Refreshed" but data is old
- Console shows invalidateQueries before sync completes

### Debug:

```javascript
// Check network tab
// Should see:
// 1. POST to sync-trips-incremental
// 2. (wait 500ms)
// 3. GET requests to fetch fresh data
```

---

## Test Suite 5: Polling Elimination

**Objective**: Verify no 15-second polling with realtime active

### Steps:

1. **Open Chrome DevTools** → Network tab
2. **Filter**: "vehicle_positions"
3. **Navigate to vehicle profile page**
4. **Wait 2 minutes**
5. **Count API calls** to vehicle_positions table

### Expected Results:

✅ **PASS**:
- Only **1 initial fetch** on page load
- **0 polling requests** every 15 seconds
- Realtime updates work without polling

❌ **FAIL**:
- API calls every 15 seconds to vehicle_positions
- Console shows refetchInterval timer

### Debug:

```javascript
// Check React Query config
// Should see: refetchInterval: false
```

---

## Test Suite 6: Error Handling

**Objective**: Verify graceful error handling

### Steps:

1. **Simulate network failure**:
   - Chrome DevTools → Network → Offline
2. **Navigate to vehicle profile page**
3. **Pull to refresh**
4. **Check error message**
5. **Re-enable network**
6. **Retry**

### Expected Results:

✅ **PASS**:
- Error toast shows: "Refresh failed - Try again"
- Page doesn't crash
- Retry button works
- Data loads successfully after retry

❌ **FAIL**:
- Page crashes or shows blank screen
- No error message
- Can't recover without page reload

---

## Test Suite 7: Multi-Tab Behavior

**Objective**: Verify realtime works across multiple tabs

### Steps:

1. **Open vehicle profile in Tab 1**
2. **Open same vehicle profile in Tab 2**
3. **Trigger position update** via database
4. **Verify both tabs update** with new position
5. **Check console in both tabs** - should show subscription success

### Expected Results:

✅ **PASS**:
- Both tabs show updated position
- Each tab has own subscription
- No conflicts or errors

❌ **FAIL**:
- Only one tab updates
- Console errors about duplicate subscriptions
- Tabs interfere with each other

---

## Performance Benchmarks

Run these tests to measure improvements:

### Benchmark 1: Page Load Time

```javascript
// Run in console on page load
performance.mark('page-start');
window.addEventListener('load', () => {
  performance.mark('page-end');
  performance.measure('page-load', 'page-start', 'page-end');
  console.log(performance.getEntriesByName('page-load'));
});
```

**Target**: < 2 seconds for initial load

### Benchmark 2: Position Update Latency

```javascript
// Measure time from DB update to UI update
const startTime = Date.now();
// Trigger DB update
// Wait for UI update
const endTime = Date.now();
console.log('Latency:', endTime - startTime, 'ms');
```

**Target**: < 1000ms (1 second)

### Benchmark 3: Memory Usage

1. Take heap snapshot on page load
2. Navigate away and back 10x
3. Take another snapshot
4. Compare

**Target**: < 5MB increase after 10 navigations

---

## Automated Testing (Future)

Consider adding these automated tests:

```typescript
describe('Realtime Subscription', () => {
  it('should cleanup on unmount', () => {
    const { unmount } = render(<OwnerVehicleProfile />);
    unmount();
    // Verify channel is removed
  });
  
  it('should respect sync cooldown', () => {
    sessionStorage.setItem('vehicle-sync-123', Date.now());
    // Verify sync doesn't trigger
  });
  
  it('should update UI on position change', () => {
    // Mock realtime event
    // Verify component updates
  });
});
```

---

## Rollback Criteria

If ANY of these occur, consider rollback:

- [ ] Memory leaks detected (>10MB per 10 navigations)
- [ ] Realtime updates stop working
- [ ] Pull-to-refresh doesn't show fresh data >50% of time
- [ ] Console errors increase significantly
- [ ] User reports of slow/frozen UI
- [ ] API error rate increases >10%

---

## Success Criteria

All tests must pass with:

- ✅ 0 memory leaks
- ✅ 0 console errors during normal operation
- ✅ <1s latency for realtime updates
- ✅ <2s page load time
- ✅ 60% reduction in API calls
- ✅ 50% reduction in re-renders

---

## Reporting

After testing, document:

1. **Test Results**: Pass/Fail for each suite
2. **Performance Metrics**: Before/After comparison
3. **Issues Found**: Any unexpected behavior
4. **User Feedback**: If tested with real users

Template:

```markdown
## Test Results - Phase 1 Fixes

**Tester**: [Name]
**Date**: [Date]
**Environment**: [Dev/Staging/Production]

| Test Suite | Status | Notes |
|------------|--------|-------|
| Memory Leak | ✅ PASS | Heap increase: 2.3MB |
| Double Re-render | ✅ PASS | Single render confirmed |
| Auto-Sync Cooldown | ✅ PASS | Works as expected |
| Pull-to-Refresh | ✅ PASS | Fresh data every time |
| Polling Elimination | ✅ PASS | No 15s polls |
| Error Handling | ✅ PASS | Graceful recovery |
| Multi-Tab | ✅ PASS | Both tabs update |

**Performance**: 
- Page load: 1.8s (target: <2s) ✅
- Update latency: 650ms (target: <1s) ✅
- Memory: +2.3MB after 10 nav (target: <5MB) ✅

**Recommendation**: ✅ APPROVED FOR PRODUCTION
```

---

## Contact

If you encounter issues during testing:

1. Check [FIXES_APPLIED_SUMMARY.md](./FIXES_APPLIED_SUMMARY.md) for implementation details
2. Review [REALTIME_SYSTEM_HEALTH_AUDIT.md](./REALTIME_SYSTEM_HEALTH_AUDIT.md) for context
3. Check console logs for debugging info
4. Capture screenshots/videos of issues

---

**Happy Testing! 🚀**
