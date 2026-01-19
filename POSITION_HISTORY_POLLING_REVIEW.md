# Position History Polling Review
**Date:** January 20, 2026  
**Component:** `usePositionHistory` Hook

---

## 📊 Current Implementation Analysis

### Hook: `usePositionHistory`
**File:** `src/hooks/useVehicleDetails.ts`

```typescript
export function usePositionHistory(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['position-history', deviceId],
    queryFn: () => fetchPositionHistory(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000,      // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000,     // Keep in cache for 5 minutes
    // ❌ NO refetchInterval - No automatic polling!
  });
}
```

**Data Fetching:**
- Fetches last 50 position records from `position_history` table
- Ordered by `gps_time DESC` (newest first)
- Only fetches: `id, latitude, longitude, speed, battery_percent, ignition_on, gps_time`

---

## 🔍 Findings

### ❌ **Issue: No Automatic Polling**

**Current Behavior:**
- ✅ Data is cached for 30 seconds (`staleTime`)
- ✅ Cache kept for 5 minutes (`gcTime`)
- ❌ **No `refetchInterval`** - Data only refreshes on:
  - Component mount
  - Manual refetch
  - Window focus (if enabled)
  - Cache invalidation

**Comparison with Other Hooks:**

| Hook | Poll Interval | staleTime | Status |
|------|--------------|-----------|--------|
| `useVehicleLiveData` | ✅ 15 seconds | 5 seconds | ✅ Active polling |
| `useFleetLiveData` | ✅ 30 seconds | 10 seconds | ✅ Active polling |
| `useFleetData` | ✅ 60 seconds | 30 seconds | ✅ Active polling |
| `usePositionHistory` | ❌ **NONE** | 30 seconds | ❌ No polling |

---

## 📍 Usage Analysis

### Where It's Used:
1. **`VehicleDetailsModal.tsx`** - Shows position history in modal

**Usage Context:**
- Modal opens → Data fetched once
- Modal stays open → Data doesn't refresh
- User waits → No new position data appears

---

## ⚠️ Impact Assessment

### Negative Impacts:
1. **Stale Data:** Position history doesn't update while modal is open
2. **User Experience:** Users must close and reopen modal to see new data
3. **Inconsistency:** Other vehicle data (live data, fleet data) auto-refreshes, but history doesn't

### Positive Aspects:
1. **Performance:** No unnecessary polling reduces database load
2. **Efficiency:** Position history is less critical than live data
3. **Battery:** Reduces client-side battery usage (mobile devices)

---

## 🎯 Recommendations

### Option 1: Add Conditional Polling (Recommended)
**Poll only when modal is open and vehicle is active**

```typescript
export function usePositionHistory(
  deviceId: string | null, 
  enabled: boolean = true,
  shouldPoll: boolean = false  // New parameter
) {
  return useQuery({
    queryKey: ['position-history', deviceId],
    queryFn: () => fetchPositionHistory(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: shouldPoll ? 60 * 1000 : false, // Poll every 60s if enabled
    refetchOnWindowFocus: false,
  });
}
```

**Usage:**
```typescript
// In VehicleDetailsModal.tsx
const { data: positionHistory } = usePositionHistory(
  vehicle?.id, 
  open,  // enabled
  open && vehicle?.status !== 'offline'  // shouldPoll - only if modal open & vehicle online
);
```

**Benefits:**
- ✅ Refreshes when modal is open
- ✅ Stops polling when modal closes (saves resources)
- ✅ Only polls for active vehicles (offline vehicles don't change)

---

### Option 2: Add Realtime Subscription
**Use Supabase Realtime instead of polling**

```typescript
export function usePositionHistory(deviceId: string | null, enabled: boolean = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['position-history', deviceId],
    queryFn: () => fetchPositionHistory(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Realtime subscription for position_history INSERT events
  useEffect(() => {
    if (!enabled || !deviceId) return;

    const channel = supabase
      .channel(`position-history:${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'position_history',
          filter: `device_id=eq.${deviceId}`
        },
        (payload) => {
          // Invalidate cache to trigger refetch
          queryClient.invalidateQueries(['position-history', deviceId]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, enabled, queryClient]);

  return query;
}
```

**Benefits:**
- ✅ Real-time updates (no polling delay)
- ✅ Only triggers when new data arrives
- ✅ More efficient than polling

**Considerations:**
- ⚠️ Requires Supabase Realtime enabled
- ⚠️ Needs `position_history` table in Realtime publication

---

### Option 3: Longer Poll Interval (Conservative)
**Add polling but with longer interval**

```typescript
export function usePositionHistory(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['position-history', deviceId],
    queryFn: () => fetchPositionHistory(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 120 * 1000, // Poll every 2 minutes (position history changes slower)
    refetchOnWindowFocus: false,
  });
}
```

**Benefits:**
- ✅ Simple implementation
- ✅ Low overhead (2-minute interval)
- ✅ Keeps data reasonably fresh

---

## 📋 Implementation Priority

### Priority 1: **Option 1 - Conditional Polling** (Recommended)
- **Effort:** Low (1 parameter, 1 line change)
- **Impact:** High (improves UX significantly)
- **Risk:** Low (opt-in behavior)

### Priority 2: **Option 2 - Realtime Subscription**
- **Effort:** Medium (realtime setup required)
- **Impact:** High (best UX, most efficient)
- **Risk:** Medium (requires Realtime configuration)

### Priority 3: **Option 3 - Long Interval Polling**
- **Effort:** Low (1 line change)
- **Impact:** Medium (better than nothing)
- **Risk:** Very Low

---

## 🧪 Testing Recommendations

### Test Scenarios:
1. **Modal Open:** Verify data refreshes while modal is open
2. **Modal Close:** Verify polling stops when modal closes
3. **Offline Vehicle:** Verify no polling for offline vehicles
4. **Performance:** Monitor database query frequency
5. **Battery Impact:** Test on mobile devices

---

## 📊 Current State Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Automatic Refresh | ❌ **NO** | Only on mount/refetch |
| Cache Strategy | ✅ Good | 30s stale, 5min cache |
| Performance | ✅ Good | No unnecessary queries |
| User Experience | ⚠️ **Fair** | Manual refresh needed |
| Consistency | ⚠️ **Poor** | Different from other hooks |

---

## ✅ Recommendation

**Implement Option 1: Conditional Polling**

This provides the best balance of:
- ✅ User experience (data refreshes when needed)
- ✅ Resource efficiency (only polls when modal is open)
- ✅ Implementation simplicity (minimal code changes)
- ✅ Consistency (similar pattern to other hooks)

---

## 🚀 Next Steps

1. **Add `shouldPoll` parameter** to `usePositionHistory`
2. **Update `VehicleDetailsModal`** to pass `shouldPoll` condition
3. **Test** with real vehicle data
4. **Monitor** database query frequency
5. **Consider Option 2** for future enhancement if Realtime is available

---

**Review Date:** January 20, 2026  
**Reviewed By:** System Audit  
**Status:** ⚠️ **Needs Improvement** - No automatic polling
