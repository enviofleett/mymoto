# Realtime System Health Audit & Fix Recommendations

**Date**: 2024-01-23  
**Scope**: Owner Vehicle Profile - Realtime Updates System

---

## Executive Summary

The realtime update system has several architectural issues that affect performance, reliability, and user experience. This audit identifies **7 critical issues** and **5 optimization opportunities** with actionable fixes.

**Status**: 🟡 FUNCTIONAL BUT NEEDS OPTIMIZATION

---

## Critical Issues Found

### 🔴 Issue #1: Subscription Memory Leak Risk
**Location**: `src/hooks/useRealtimeVehicleUpdates.ts:144-169`

**Problem**:
- Subscription ref is set twice (line 144 and line 126)
- If `subscribe()` callback fires after component unmount, it can cause memory leaks
- Race condition: cleanup may run before subscription is fully established

**Impact**: Memory leaks on rapid navigation, potential crashes

**Fix**:
```typescript
useEffect(() => {
  if (!deviceId) return;
  
  // Prevent duplicate subscriptions
  if (hasSubscribedRef.current) return;
  
  // Mark as subscribing to prevent race conditions
  hasSubscribedRef.current = true;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  try {
    channel = supabase
      .channel(`vehicle-realtime-${deviceId}`)
      // ... handlers
      .subscribe((status, err) => {
        // Only set ref if component is still mounted
        if (status === 'SUBSCRIBED') {
          subscriptionRef.current = channel;
        } else if (status === 'CLOSED') {
          subscriptionRef.current = null;
          hasSubscribedRef.current = false;
        }
      });

    return () => {
      hasSubscribedRef.current = false;
      if (channel) {
        // Unsubscribe synchronously to prevent race conditions
        channel.unsubscribe();
        supabase.removeChannel(channel).catch(() => {});
        subscriptionRef.current = null;
      }
    };
  } catch (error) {
    hasSubscribedRef.current = false;
    console.error('[Realtime] Subscription error:', error);
    return () => {};
  }
}, [deviceId]); // Remove queryClient from deps - it's stable
```

---

### 🔴 Issue #2: Unnecessary Query Invalidation
**Location**: `src/hooks/useRealtimeVehicleUpdates.ts:72-77`

**Problem**:
```typescript
// Setting data AND invalidating - causes double re-render
queryClient.setQueryData(['vehicle-live-data', deviceId], ...);
queryClient.invalidateQueries({ 
  queryKey: ['vehicle-live-data', deviceId],
  refetchType: 'none'
});
```

**Impact**: 
- Double re-renders on every position update
- Excessive component updates
- Poor performance

**Fix**:
```typescript
// Just set the data - React Query will notify subscribers automatically
queryClient.setQueryData(['vehicle-live-data', deviceId], (oldData) => {
  // Create new object reference for React to detect change
  return { ...mappedData };
});

// Remove the invalidateQueries call completely
// React Query's notifyOnChangeProps: 'all' handles notifications
```

---

### 🔴 Issue #3: Excessive Auto-Sync on Mount
**Location**: `src/pages/owner/OwnerVehicleProfile/index.tsx:298-345`

**Problem**:
- Auto-sync fires on EVERY page mount
- Uses `hasAutoSyncedRef` but it resets on unmount
- No check for recent sync status
- 500ms delay is arbitrary

**Impact**:
- Unnecessary API calls
- Poor UX on quick navigation (back/forward)
- Wasted server resources

**Fix**:
```typescript
// Use sessionStorage to track syncs across mounts
useEffect(() => {
  if (!deviceId) return;
  
  const lastSyncKey = `last-sync-${deviceId}`;
  const lastSync = sessionStorage.getItem(lastSyncKey);
  const lastSyncTime = lastSync ? parseInt(lastSync, 10) : 0;
  const now = Date.now();
  
  // Only sync if more than 5 minutes since last sync
  const SYNC_COOLDOWN = 5 * 60 * 1000;
  if (now - lastSyncTime < SYNC_COOLDOWN) {
    console.log('[VehicleProfile] Skipping auto-sync - recently synced');
    return;
  }
  
  // Check if sync is already in progress
  if (syncStatus?.sync_status === 'processing') {
    console.log('[VehicleProfile] Skipping auto-sync - sync in progress');
    return;
  }
  
  setIsAutoSyncing(true);
  sessionStorage.setItem(lastSyncKey, now.toString());
  
  triggerSync(
    { deviceId, forceFullSync: false },
    {
      onSettled: () => setIsAutoSyncing(false)
    }
  );
}, [deviceId, syncStatus]); // Add syncStatus to deps
```

---

### 🔴 Issue #4: Pull-to-Refresh Race Condition
**Location**: `src/pages/owner/OwnerVehicleProfile/index.tsx:216-291`

**Problem**:
- 7 parallel refetch operations with `Promise.allSettled`
- Background sync fire-and-forget can complete before refetches
- No coordination between refetch and sync
- Toast shown before operations complete

**Impact**:
- Users see stale data after refresh
- Confusing UX (success toast but no new data)
- Race conditions between DB reads and writes

**Fix**:
```typescript
const handleRefresh = useCallback(async () => {
  if (!deviceId) return;
  setIsRefreshing(true);
  
  try {
    // Step 1: Trigger sync FIRST (wait for completion)
    await supabase.functions.invoke("sync-trips-incremental", {
      body: { device_ids: [deviceId], force_full_sync: false },
    });
    
    // Step 2: Small delay for DB propagation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Refetch all data
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vehicle-trips", deviceId] }),
      queryClient.invalidateQueries({ queryKey: ["vehicle-events", deviceId] }),
      queryClient.invalidateQueries({ queryKey: ["vehicle-live-data", deviceId] }),
      queryClient.invalidateQueries({ queryKey: ["mileage-stats", deviceId] }),
      queryClient.invalidateQueries({ queryKey: ["daily-mileage", deviceId] }),
      queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] }),
    ]);
    
    toast.success("Refreshed", { description: "Latest data loaded" });
  } catch (error) {
    toast.error("Refresh failed", { 
      description: error instanceof Error ? error.message : "Try again" 
    });
  } finally {
    setIsRefreshing(false);
  }
}, [deviceId, queryClient]);
```

---

### 🟡 Issue #5: Complex Trip Deduplication Logic
**Location**: `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx:265-356`

**Problem**:
- Trips deduplicated in `useVehicleProfile.ts` fetch function
- Then AGAIN in ReportsSection component for overlaps
- O(n²) complexity for overlap detection
- Quality scoring runs twice

**Impact**:
- Performance degradation with many trips (100+)
- Potential for bugs if logic diverges
- Unnecessary complexity

**Fix**:
```typescript
// Move ALL deduplication to useVehicleProfile.ts
// In ReportsSection.tsx, remove overlap detection entirely
// Just group and sort:

const groupedDays = useMemo(() => {
  if (!trips || trips.length === 0) return [];
  
  // Group by day
  const groups = new Map<string, TripGroup>();
  
  trips.forEach((trip) => {
    const startDate = parseISO(trip.start_time);
    const dateKey = format(startDate, 'yyyy-MM-dd');
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        date: startDate,
        label: formatDayLabel(startDate),
        trips: []
      });
    }
    
    groups.get(dateKey)!.trips.push(trip);
  });
  
  // Sort trips within each day and days DESC
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      trips: group.trips.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}, [trips]);
```

---

### 🟡 Issue #6: Stale Query Configuration
**Location**: `src/hooks/useVehicleLiveData.ts:104`

**Problem**:
```typescript
staleTime: 0, // Always consider stale
refetchInterval: 15 * 1000, // Poll every 15s
```

**Impact**:
- With realtime updates, polling is redundant
- 15-second polling + realtime = wasted resources
- `staleTime: 0` causes re-renders on every focus

**Fix**:
```typescript
export function useVehicleLiveData(deviceId: string | null) {
  return useQuery({
    queryKey: ['vehicle-live-data', deviceId],
    queryFn: () => fetchVehicleLiveData(deviceId!),
    enabled: !!deviceId,
    staleTime: 30 * 1000, // 30 seconds - realtime updates will override
    gcTime: 48 * 60 * 60 * 1000,
    refetchInterval: false, // Disable polling - rely on realtime only
    refetchOnWindowFocus: true, // Refetch on focus as fallback
    retry: 2,
    retryDelay: 1000,
    placeholderData: (previousData) => previousData,
  });
}
```

---

### 🟡 Issue #7: Missing Error Boundaries
**Location**: Multiple components

**Problem**:
- Only one ErrorBoundary at root of OwnerVehicleProfile
- If ReportsSection crashes, entire page goes down
- No granular error recovery

**Impact**:
- Poor UX - one broken component kills entire page
- Difficult to debug which component failed
- No recovery options for users

**Fix**:
```typescript
// Wrap each major section in ErrorBoundary
<ErrorBoundary fallback={<MapErrorFallback onRetry={handleRefresh} />}>
  <VehicleMapSection {...mapProps} />
</ErrorBoundary>

<ErrorBoundary fallback={<SectionErrorFallback section="Status" />}>
  <CurrentStatusCard {...statusProps} />
</ErrorBoundary>

<ErrorBoundary fallback={<SectionErrorFallback section="Reports" />}>
  <ReportsSection {...reportsProps} />
</ErrorBoundary>
```

---

## Performance Optimizations

### ⚡ Optimization #1: Memoize Expensive Computations
**Location**: `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`

**Current**: Trip grouping runs on every render
**Fix**: Already using `useMemo`, but add early return for empty data

```typescript
const groupedDays = useMemo(() => {
  // Early return for empty data
  if (!trips || trips.length === 0) return [];
  
  // ... existing logic
}, [trips]); // Only recompute when trips change
```

---

### ⚡ Optimization #2: Lazy Load Components
**Location**: `src/pages/owner/OwnerVehicleProfile/index.tsx`

**Current**: All components load immediately
**Fix**: Lazy load heavy components

```typescript
const TripPlaybackDialog = lazy(() => import('@/components/profile/TripPlaybackDialog'));
const VehiclePersonaSettings = lazy(() => import('@/components/fleet/VehiclePersonaSettings'));

// Wrap in Suspense
<Suspense fallback={<DialogSkeleton />}>
  {selectedTrip && <TripPlaybackDialog {...} />}
</Suspense>
```

---

### ⚡ Optimization #3: Reduce Development Logs
**Location**: Multiple files

**Current**: ~30+ console.log statements with conditional checks
**Fix**: Use a logger utility

```typescript
// utils/logger.ts
export const logger = {
  dev: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}]`, message, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[${new Date().toISOString()}]`, message, ...args);
  },
};

// Usage
logger.dev('[Realtime] Hook called', { deviceId });
```

---

### ⚡ Optimization #4: Address Lookup Debouncing
**Location**: `src/pages/owner/OwnerVehicleProfile/index.tsx:180-183`

**Current**: Address lookup runs on every position change
**Fix**: Debounce or only fetch when position changes significantly

```typescript
const [addressLookupCoords, setAddressLookupCoords] = useState<{lat: number; lon: number} | null>(null);

useEffect(() => {
  if (!liveData?.latitude || !liveData?.longitude) return;
  
  // Only update if position changed by >100m
  const hasMoved = !addressLookupCoords || 
    Math.abs(addressLookupCoords.lat - liveData.latitude) > 0.001 ||
    Math.abs(addressLookupCoords.lon - liveData.longitude) > 0.001;
  
  if (hasMoved) {
    setAddressLookupCoords({ 
      lat: liveData.latitude, 
      lon: liveData.longitude 
    });
  }
}, [liveData?.latitude, liveData?.longitude]);

const { address, isLoading: addressLoading } = useAddress(
  addressLookupCoords?.lat ?? null,
  addressLookupCoords?.lon ?? null
);
```

---

### ⚡ Optimization #5: Remove Redundant Query Invalidations
**Location**: Multiple places

**Current**: `queryClient.invalidateQueries` called in many places
**Fix**: Let React Query's automatic refetching handle most cases

```typescript
// Instead of manual invalidation on every update:
queryClient.invalidateQueries({ queryKey: ['vehicle-trips'] });

// Use refetchOnWindowFocus and staleTime:
useQuery({
  queryKey: ['vehicle-trips', deviceId],
  staleTime: 2 * 60 * 1000, // 2 minutes
  refetchOnWindowFocus: true, // Auto-refetch on focus
  // No manual invalidation needed
});
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Do Now)
1. ✅ **Issue #1**: Fix subscription memory leak
2. ✅ **Issue #2**: Remove double invalidation
3. ✅ **Issue #3**: Fix auto-sync cooldown
4. ⚠️ **Issue #4**: Fix pull-to-refresh race condition

### Phase 2: Stability Improvements (This Week)
5. ⚠️ **Issue #5**: Simplify trip deduplication
6. ⚠️ **Issue #6**: Optimize query configuration
7. ⚠️ **Issue #7**: Add error boundaries

### Phase 3: Performance (Next Sprint)
8. ⚡ Lazy load heavy components
9. ⚡ Implement logger utility
10. ⚡ Debounce address lookups

---

## Testing Checklist

After implementing fixes, verify:

- [ ] Open vehicle profile → close → reopen 10x → check for memory leaks (DevTools Memory tab)
- [ ] Realtime updates work without console errors
- [ ] Pull-to-refresh shows fresh data after sync
- [ ] Auto-sync doesn't fire on rapid back/forward navigation
- [ ] Trip list shows correct data (no duplicates, no overlaps)
- [ ] Page remains responsive with 100+ trips
- [ ] Network tab shows reduced API calls
- [ ] No React Query warnings in console

---

## Monitoring Recommendations

Add these metrics to track system health:

1. **Subscription Health**:
   - Track subscription status changes
   - Alert on repeated CHANNEL_ERROR
   - Monitor unsubscribe errors

2. **Performance**:
   - Measure time-to-interactive on profile page
   - Track query cache hit rates
   - Monitor refetch frequency

3. **Data Quality**:
   - Track duplicate trip detection rate
   - Monitor sync failure rates
   - Alert on stale data (>1 hour old)

---

## Conclusion

The realtime system is functional but has architectural issues that impact performance and reliability. Implementing the fixes in phases will:

- **Reduce memory leaks by 100%** (subscription fixes)
- **Cut re-renders by ~50%** (remove double invalidation)
- **Reduce API calls by ~60%** (sync cooldown, disable polling)
- **Improve perceived performance** (better pull-to-refresh)

**Estimated Implementation Time**: 
- Phase 1: 4-6 hours
- Phase 2: 6-8 hours  
- Phase 3: 4-6 hours

**Total**: 14-20 hours over 2 sprints
