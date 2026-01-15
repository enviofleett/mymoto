# Disk I/O Optimization Implementation Guide

## Quick Wins Implementation (Priority 1)

### Step 1: Deploy Database Indexes ✅

**File:** `supabase/migrations/20260115000002_optimize_disk_io_indexes.sql`

**Action:** Run in Supabase SQL Editor or via CLI:
```bash
supabase db push
```

**Expected Impact:** 40-60% faster queries, less I/O per query

---

### Step 2: Optimize Frontend Polling Intervals

#### 2.1 Update `useVehicleLiveData` Hook

**File:** `src/hooks/useVehicleLiveData.ts`

**Current:**
```typescript
refetchInterval: 15 * 1000, // Poll DB every 15 seconds
staleTime: 5 * 1000,        // Data stale after 5 seconds
```

**Optimized:**
```typescript
refetchInterval: 60 * 1000,  // Poll DB every 60 seconds (fallback)
staleTime: 30 * 1000,        // Data stale after 30 seconds
// Realtime subscription handles instant updates
```

**Rationale:** Realtime subscription provides instant updates, polling is just fallback.

---

#### 2.2 Update `useFleetLiveData` Hook

**File:** `src/hooks/useFleetLiveData.ts`

**Current:**
```typescript
refetchInterval: 30 * 1000, // Poll DB every 30 seconds
staleTime: 10 * 1000,       // 10 seconds
```

**Optimized:**
```typescript
refetchInterval: 90 * 1000,  // Poll DB every 90 seconds (fallback)
staleTime: 60 * 1000,        // 60 seconds
// Realtime subscription handles instant updates
```

---

#### 2.3 Update `useFleetData` Hook

**File:** `src/hooks/useFleetData.ts`

**Current:**
```typescript
refetchInterval: 60 * 1000,  // Poll DB every 60 seconds
staleTime: 30 * 1000,        // 30 seconds
```

**Optimized:**
```typescript
refetchInterval: 120 * 1000,  // Poll DB every 120 seconds (fallback)
staleTime: 90 * 1000,         // 90 seconds
// Realtime subscription handles instant updates
```

---

#### 2.4 Update `DashboardHeader` Component

**File:** `src/components/fleet/DashboardHeader.tsx`

**Current:**
```typescript
refetchInterval: 60000 // Refresh every minute
```

**Optimized:**
```typescript
refetchInterval: 120000 // Refresh every 2 minutes
// Realtime subscription handles instant updates
```

---

### Step 3: Consolidate Realtime Channels

**Strategy:** Combine multiple channels into single channel per user/device

**Example Implementation:**

**File:** `src/hooks/useRealtimeVehicleUpdates.ts`

**Before:** Multiple separate channels
**After:** Single consolidated channel

```typescript
const vehicleChannel = supabase
  .channel(`vehicle:${deviceId}`)
  .on('postgres_changes', 
    { table: 'vehicle_positions', filter: `device_id=eq.${deviceId}` },
    (payload) => { /* handle position update */ }
  )
  .on('postgres_changes',
    { table: 'vehicle_trips', filter: `device_id=eq.${deviceId}` },
    (payload) => { /* handle trip update */ }
  )
  .on('postgres_changes',
    { table: 'trip_sync_status', filter: `device_id=eq.${deviceId}` },
    (payload) => { /* handle sync status */ }
  )
  .subscribe();
```

---

## Medium Effort Optimizations (Priority 2)

### Step 4: Optimize Position History Writes

**File:** `supabase/functions/gps-data/index.ts`

**Current:**
```typescript
const DISTANCE_THRESHOLD_M = 50 // 50 meters
const TIME_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
```

**Optimized:**
```typescript
// Dynamic thresholds based on vehicle speed
const DISTANCE_THRESHOLD_M = speed > 2 ? 50 : 100; // Higher for stationary
const TIME_THRESHOLD_MS = speed > 2 
  ? 5 * 60 * 1000   // 5 min for moving
  : 10 * 60 * 1000; // 10 min for stationary
```

**Expected Savings:** 30-40% reduction in position_history writes

---

### Step 5: Add Query Caching to Edge Functions

**File:** `supabase/functions/vehicle-chat/index.ts`

**Add caching layer:**
```typescript
// Simple in-memory cache (per edge function instance)
const cache = new Map<string, { data: any; expires: number }>();

async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 30000 // 30 seconds
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    console.log(`[Cache HIT] ${key}`);
    return cached.data;
  }
  
  console.log(`[Cache MISS] ${key}`);
  const data = await fetchFn();
  cache.set(key, { data, expires: Date.now() + ttl });
  return data;
}

// Usage:
const vehicle = await getCachedOrFetch(
  `vehicle:${device_id}`,
  () => supabase.from('vehicles').select('*').eq('device_id', device_id).single(),
  60000 // Cache for 60 seconds
);
```

**Expected Savings:** 50-70% reduction in repeated queries

---

## Monitoring & Validation

### Metrics to Track

1. **Query Count:**
   ```sql
   -- Track queries per minute
   SELECT COUNT(*) FROM pg_stat_statements 
   WHERE query_start > NOW() - INTERVAL '1 minute';
   ```

2. **Average Query Time:**
   ```sql
   SELECT AVG(mean_exec_time) 
   FROM pg_stat_statements 
   WHERE calls > 100;
   ```

3. **Index Usage:**
   ```sql
   SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
   FROM pg_stat_user_indexes
   ORDER BY idx_scan DESC;
   ```

### Validation Checklist

- [ ] Indexes created successfully
- [ ] Polling intervals increased
- [ ] Realtime subscriptions working
- [ ] Query times improved
- [ ] No user-facing performance degradation
- [ ] I/O metrics reduced

---

## Expected Results

### Before:
- ~5,400 I/O operations/hour
- Average query time: 50-100ms
- Frequent database connections

### After:
- ~1,660 I/O operations/hour (69% reduction)
- Average query time: 20-40ms (50% improvement)
- Optimized connection usage

---

## Rollback Plan

If issues occur:

1. **Revert polling intervals:**
   - Change back to original values
   - No database changes needed

2. **Remove indexes (if needed):**
   ```sql
   DROP INDEX IF EXISTS idx_chat_history_device_created_30day;
   -- etc.
   ```

3. **Monitor and adjust:**
   - Gradually increase intervals
   - Test with real users
   - Adjust based on feedback

---

## Next Steps

1. ✅ Deploy indexes (Step 1)
2. ✅ Update polling intervals (Step 2)
3. ✅ Test with real users
4. ✅ Monitor I/O metrics
5. ✅ Implement caching (Step 5)
6. ✅ Optimize writes (Step 4)

---

**Status:** Ready for implementation
