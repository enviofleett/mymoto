# 🚀 VEHICLE PROFILE AUTO-SYNC & MILEAGE FIX - IMPLEMENTATION GUIDE

## 📋 OVERVIEW

This guide implements:
1. ✅ **Auto-sync on page load** - No manual sync button needed
2. ✅ **Unified mileage data** - Single source of truth
3. ✅ **Trip validation** - Show GPS quality indicators
4. ✅ **Optimized queries** - Consistent 30s refresh

---

## 🎯 PHASE 1: AUTO-SYNC ON PAGE LOAD

### **File: `src/pages/owner/OwnerVehicleProfile/index.tsx`**

**Add state for auto-sync (after line 52):**

```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
const [isAutoSyncing, setIsAutoSyncing] = useState(false); // ← ADD THIS
```

**Add auto-sync effect (after line 168, before handleForceSync):**

```typescript
// AUTO-SYNC ON PAGE LOAD - Ensures fresh trip data without manual sync
useEffect(() => {
  if (!deviceId) return;

  const autoSyncOnMount = async () => {
    console.log('[VehicleProfile] Auto-syncing trips on page load');
    setIsAutoSyncing(true);

    try {
      // Trigger incremental sync in background (non-blocking)
      // This runs silently and updates the UI when complete
      supabase.functions.invoke("sync-trips-incremental", {
        body: {
          device_ids: [deviceId],
          force_full_sync: false  // Quick incremental sync only
        },
      }).then(result => {
        console.log('[VehicleProfile] Auto-sync completed:', result);

        // Invalidate trips query to trigger refetch with fresh data
        queryClient.invalidateQueries({
          queryKey: ["vehicle-trips", deviceId],
          exact: false // Invalidate all variants
        });

        // Also invalidate daily stats for mileage consistency
        queryClient.invalidateQueries({
          queryKey: ["vehicle-daily-stats", deviceId],
          exact: false
        });

        setIsAutoSyncing(false);
      }).catch(error => {
        console.warn('[VehicleProfile] Auto-sync failed (non-critical):', error);
        setIsAutoSyncing(false);
        // Don't show error to user - background operation failure is non-critical
        // Cached data is still shown
      });

    } catch (error) {
      console.warn('[VehicleProfile] Auto-sync error:', error);
      setIsAutoSyncing(false);
    }
  };

  // Small delay to let page render first (better UX)
  const timer = setTimeout(autoSyncOnMount, 500);

  return () => clearTimeout(timer);
}, [deviceId, queryClient]); // Only run on mount or when deviceId changes
```

**Update ReportsSection to show auto-sync status (around line 436):**

```typescript
// Change this line:
isSyncing={isSyncing || syncStatus?.sync_status === "processing"}

// To:
isSyncing={isSyncing || isAutoSyncing || syncStatus?.sync_status === "processing"}

// And pass isAutoSyncing prop:
isAutoSyncing={isAutoSyncing}
```

**Update ReportsSection props interface (add to props):**

```typescript
// In src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx
// Add to ReportsSectionProps interface (around line 55):
isAutoSyncing?: boolean;
```

**Update sync indicator in ReportsSection (around line 257-268):**

```typescript
{syncStatus && (
  <div className="flex items-center gap-1.5">
    {isSyncing || isAutoSyncing ? (
      <>
        <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
        <span className="text-xs text-muted-foreground">
          {isAutoSyncing ? 'Auto-syncing...' : 'Syncing...'}
        </span>
      </>
    ) : syncStatus.sync_status === "completed" ? (
      <CheckCircle2 className="h-3 w-3 text-green-500" />
    ) : syncStatus.sync_status === "error" ? (
      <AlertTriangle className="h-3 w-3 text-red-500" />
    ) : null}
    {isRealtimeActive && !isSyncing && !isAutoSyncing && (
      <Radio className="h-3 w-3 text-green-500 animate-pulse" />
    )}
  </div>
)}
```

---

## 🎯 PHASE 2: REWRITE MILEAGE LAYER (SINGLE SOURCE OF TRUTH)

### **File: `src/pages/owner/OwnerVehicleProfile/index.tsx`**

**REMOVE these hooks (around lines 124-134):**

```typescript
// ❌ DELETE THESE:
const {
  data: mileageStats,
  error: mileageError,
  refetch: refetchMileage
} = useMileageStats(deviceId, true);

const {
  data: dailyMileage,
  error: dailyMileageError,
  refetch: refetchDaily
} = useDailyMileage(deviceId, true);
```

**UPDATE refetch calls (around line 227-234):**

```typescript
// Remove from Promise.allSettled:
// refetchMileage(),  // ❌ DELETE
// refetchDaily(),    // ❌ DELETE

// Keep only:
const refetchResults = await Promise.allSettled([
  refetchProfile(),
  refetchLive(),
  refetchTrips(),
  refetchEvents(),
  refetchDailyStats(),  // ✅ Single source of truth
]);
```

**UPDATE MileageSection props (around line 417-423):**

```typescript
// Change from:
<MileageSection
  totalMileage={liveData?.totalMileageKm ?? null}
  dailyStats={dailyStats}
  mileageStats={mileageStats}  // ❌ REMOVE
  dailyMileage={dailyMileage}  // ❌ REMOVE
  dateRange={dateRange}
/>

// To:
<MileageSection
  totalMileage={liveData?.totalMileageKm ?? null}
  dailyStats={dailyStats}
  dateRange={dateRange}
/>
```

---

### **File: `src/pages/owner/OwnerVehicleProfile/components/MileageSection.tsx`**

**REPLACE interface (lines 26-36):**

```typescript
interface MileageSectionProps {
  totalMileage: number | null;
  dailyStats: VehicleDailyStats[] | undefined;
  dateRange: DateRange | undefined;
  // ❌ REMOVED: mileageStats
  // ❌ REMOVED: dailyMileage
}
```

**REPLACE component function (lines 38-176):**

```typescript
export function MileageSection({
  totalMileage,
  dailyStats,
  dateRange,
}: MileageSectionProps) {
  const isFilterActive = !!dateRange?.from;

  // ✅ SINGLE SOURCE OF TRUTH - Derive all stats from dailyStats
  const stats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return {
        todayDistance: 0,
        todayTrips: 0,
        weekDistance: 0,
        weekTrips: 0,
        avgPerDay: 0,
        totalDistance: 0,
        totalTrips: 0,
        daysWithData: 0,
        peakSpeed: 0,
        avgKmPerTrip: 0,
      };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    // Apply date filter if provided
    let filtered = dailyStats;
    if (dateRange?.from) {
      const fromStr = dateRange.from.toISOString().split('T')[0];
      const toStr = dateRange.to?.toISOString().split('T')[0] || fromStr;
      filtered = dailyStats.filter(s => s.stat_date >= fromStr && s.stat_date <= toStr);
    }

    // Calculate today's stats
    const todayStat = dailyStats.find(s => s.stat_date === today);

    // Calculate week's stats (last 7 days)
    const weekStats = dailyStats.filter(s => s.stat_date >= weekAgoStr);

    // Calculate filtered period stats
    const totalDistance = filtered.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
    const totalTrips = filtered.reduce((sum, s) => sum + s.trip_count, 0);
    const weekDistance = weekStats.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
    const weekTrips = weekStats.reduce((sum, s) => sum + s.trip_count, 0);
    const peakSpeed = Math.max(...filtered.map(s => s.peak_speed || 0));

    return {
      todayDistance: todayStat ? Number(todayStat.total_distance_km) : 0,
      todayTrips: todayStat ? todayStat.trip_count : 0,
      weekDistance,
      weekTrips,
      avgPerDay: filtered.length > 0 ? totalDistance / filtered.length : 0,
      totalDistance,
      totalTrips,
      daysWithData: filtered.length,
      peakSpeed,
      avgKmPerTrip: totalTrips > 0 ? totalDistance / totalTrips : 0,
    };
  }, [dailyStats, dateRange]);

  // Convert daily stats to chart data
  const chartData = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) return [];

    let filtered = dailyStats;
    if (dateRange?.from) {
      const fromDate = dateRange.from.toISOString().split('T')[0];
      const toDate = dateRange.to?.toISOString().split('T')[0] || fromDate;
      filtered = dailyStats.filter(s => s.stat_date >= fromDate && s.stat_date <= toDate);
    }

    return filtered
      .map(stat => ({
        day: format(parseISO(stat.stat_date), 'EEE'),
        date: stat.stat_date,
        distance: Number(stat.total_distance_km),
        trips: stat.trip_count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyStats, dateRange]);

  const displayData = chartData.length > 0 ? chartData : [];

  return (
    <>
      {/* Mileage Stats Card */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Mileage Report</span>
            </div>
            {isFilterActive ? (
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                <Filter className="h-3 w-3 mr-1" />
                Filtered
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Calendar className="h-4 w-4" />
                Last 30 Days
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="text-sm text-muted-foreground">
              {isFilterActive ? "Period Distance" : "Total Odometer"}
            </div>
            <div className="text-3xl font-bold text-foreground">
              {isFilterActive
                ? stats.totalDistance.toFixed(1)
                : typeof totalMileage === 'number'
                  ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : stats.totalDistance.toFixed(1)
              } <span className="text-base font-normal">km</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-purple-500/10 p-3 text-center">
              <Route className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-purple-500">
                {isFilterActive ? stats.totalTrips : stats.todayTrips}
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive ? "Total Trips" : "Today"}
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">
                {stats.avgPerDay.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Avg km/day</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-primary">
                {isFilterActive
                  ? stats.daysWithData
                  : stats.weekDistance.toFixed(1)
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive ? "Days" : "This Week"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mileage Chart */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Mileage Trend</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isFilterActive
                  ? `${chartData.length} day${chartData.length !== 1 ? 's' : ''} selected`
                  : "Last 30 days"
                }
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-primary">
                {stats.totalDistance.toFixed(1)} km
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: {stats.avgPerDay.toFixed(1)}/day
              </div>
            </div>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayData}>
                <defs>
                  <linearGradient id="mileageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`${typeof value === 'number' ? value.toFixed(1) : 0} km`, 'Distance']}
                />
                <Area
                  type="monotone"
                  dataKey="distance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#mileageGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Trip Activity Chart */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Route className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Trip Activity</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isFilterActive
                  ? `${chartData.length} day${chartData.length !== 1 ? 's' : ''} selected`
                  : "Last 30 days"
                }
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-purple-500">{stats.totalTrips} trips</div>
              <div className="text-xs text-muted-foreground">
                {stats.totalDistance.toFixed(1)} km total
              </div>
            </div>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayData}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`${value} trips`, 'Trips']}
                />
                <Bar dataKey="trips" fill="hsl(270, 70%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">
                {stats.daysWithData > 0 ? (stats.totalTrips / stats.daysWithData).toFixed(1) : '0.0'}
              </div>
              <div className="text-xs text-muted-foreground">Avg trips/day</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-500">
                {Math.max(...chartData.map(d => d.trips), 0)}
              </div>
              <div className="text-xs text-muted-foreground">Peak trips</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-primary">
                {stats.avgKmPerTrip.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Avg km/trip</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 🎯 PHASE 3: OPTIMIZE QUERY STALE TIMES

### **File: `src/hooks/useVehicleProfile.ts`**

**UPDATE useVehicleDailyStats (around line 407-419):**

```typescript
export function useVehicleDailyStats(
  deviceId: string | null,
  days: number = 30,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["vehicle-daily-stats", deviceId, days],
    queryFn: () => fetchVehicleDailyStats(deviceId!, days),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000, // ✅ CHANGED: 30 seconds (was 5 minutes)
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true, // ✅ ADDED: Refetch when user returns to tab
    refetchOnReconnect: true,   // ✅ ADDED: Refetch when network reconnects
  });
}
```

---

## 🎯 PHASE 4: ADD TRIP VALIDATION

### **File: `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`**

**UPDATE TripCard component (lines 507-618):**

```typescript
function TripCard({
  trip,
  index,
  onPlayTrip
}: {
  trip: VehicleTrip;
  index: number;
  onPlayTrip: (trip: VehicleTrip) => void;
}) {
  // Check if coordinates are valid (not 0,0)
  const hasValidStartCoords = trip.start_latitude && trip.start_longitude &&
                             trip.start_latitude !== 0 && trip.start_longitude !== 0;
  const hasValidEndCoords = trip.end_latitude && trip.end_longitude &&
                             trip.end_latitude !== 0 && trip.end_longitude !== 0;

  // ✅ NEW: Determine if trip can be played back
  const canPlayback = hasValidStartCoords && hasValidEndCoords;

  const { address: startAddress, isLoading: startLoading } = useAddress(
    hasValidStartCoords ? trip.start_latitude : null,
    hasValidStartCoords ? trip.start_longitude : null
  );
  const { address: endAddress, isLoading: endLoading } = useAddress(
    hasValidEndCoords ? trip.end_latitude : null,
    hasValidEndCoords ? trip.end_longitude : null
  );

  const getGoogleMapsLink = (lat: number, lon: number) => {
    return `https://www.google.com/maps?q=${lat},${lon}`;
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">Trip {index + 1}</span>

            {/* ✅ NEW: GPS quality indicator */}
            {!canPlayback && (
              <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
                GPS incomplete
              </Badge>
            )}

            {hasValidEndCoords && (
              <a
                href={getGoogleMapsLink(trip.end_latitude, trip.end_longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(trip.start_time), 'h:mm a')} - {format(parseISO(trip.end_time), 'h:mm a')}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <div className="text-sm font-medium">
              {trip.distance_km > 0 ? trip.distance_km.toFixed(1) : '0.0'} km
            </div>
            <div className="text-xs text-green-500">
              {trip.duration_seconds
                ? Math.round(trip.duration_seconds / 60)
                : differenceInMinutes(parseISO(trip.end_time), parseISO(trip.start_time))
              } min
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPlayTrip(trip)}
            disabled={!canPlayback} // ✅ NEW: Disable if no GPS
            title={canPlayback ? "Play trip" : "GPS data unavailable for playback"}
          >
            <Play className={cn("h-4 w-4", !canPlayback && "opacity-50")} />
          </Button>
        </div>
      </div>

      {/* Start and End Addresses */}
      <div className="mt-2 pt-2 border-t border-border space-y-2">
        <div className="flex items-start gap-2">
          <MapPin className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">From</p>
            {startLoading ? (
              <Skeleton className="h-3 w-full" />
            ) : hasValidStartCoords ? (
              <p className="text-xs text-foreground line-clamp-2">
                {startAddress || `${trip.start_latitude.toFixed(5)}, ${trip.start_longitude.toFixed(5)}`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Location data unavailable
              </p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ArrowRight className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0 ml-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">To</p>
            {endLoading ? (
              <Skeleton className="h-3 w-full" />
            ) : hasValidEndCoords ? (
              <p className="text-xs text-foreground line-clamp-2">
                {endAddress || `${trip.end_latitude.toFixed(5)}, ${trip.end_longitude.toFixed(5)}`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Location data unavailable
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 🎯 PHASE 5: REMOVE DEBUG LOGGING

### **File: `src/pages/owner/OwnerVehicleProfile/components/ReportsSection.tsx`**

**WRAP all console.log statements with development check:**

```typescript
// Lines 76-88 - Wrap with condition
if (process.env.NODE_ENV === 'development') {
  console.log('[ReportsSection] Props received:', {
    tripsCount: trips?.length || 0,
    tripsLoading,
    dateRange: dateRange ? `${dateRange.from?.toISOString()} to ${dateRange.to?.toISOString()}` : 'none',
    deviceId
  });

  if (trips && trips.length > 0) {
    const tripDates = trips.map(t => t.start_time.split('T')[0]);
    const uniqueDates = [...new Set(tripDates)];
    console.log('[ReportsSection] Trip dates in props:', uniqueDates.sort().reverse());
  }
}
```

**Do the same for all other console.log statements in the file.**

---

## ✅ TESTING CHECKLIST

After implementing:

### Manual Testing:
- [ ] Open vehicle profile page
- [ ] See "Auto-syncing..." indicator appear briefly
- [ ] Trips load without clicking sync button
- [ ] Mileage numbers consistent between card and charts
- [ ] Date filter updates all stats consistently
- [ ] Trips with missing GPS show "GPS incomplete" badge
- [ ] Play button disabled for incomplete trips
- [ ] Pull-to-refresh updates all data
- [ ] No console errors in production

### Data Validation:
- [ ] Today's trip count matches trip list
- [ ] Week mileage = sum of last 7 days
- [ ] Chart totals match summary cards
- [ ] Filtered stats match visible data

---

## 🐛 TROUBLESHOOTING

### Issue: Auto-sync doesn't run
**Check:** Console for "[VehicleProfile] Auto-syncing..." message
**Fix:** Verify `deviceId` is not null

### Issue: Mileage shows 0
**Check:** Run SQL: `SELECT * FROM vehicle_daily_stats WHERE device_id = 'YOUR_ID' LIMIT 10`
**Fix:** Run trip sync manually to populate data

### Issue: Play button still enabled for incomplete trips
**Check:** Trip coordinates in database: `SELECT start_latitude, end_latitude FROM vehicle_trips LIMIT 5`
**Fix:** Verify canPlayback logic checks for !== 0

---

## 📊 EXPECTED BEHAVIOR

**Before fixes:**
```
User opens page → sees old trips → must click sync → waits → sees new trips
Mileage: Today 10km, Chart shows 8km (inconsistent)
```

**After fixes:**
```
User opens page → sees cached trips (instant) → auto-sync starts → fresh trips appear (3s)
Mileage: All numbers consistent everywhere
Incomplete trips: Shows "GPS incomplete" badge, play button disabled
```

---

## 🚀 DEPLOYMENT

1. Test locally first
2. Commit changes with clear message
3. Deploy to staging
4. Verify auto-sync works
5. Check mileage consistency
6. Deploy to production
7. Monitor for 24 hours

---

**Implementation time: ~4 hours**
**Risk level: LOW (incremental changes)**
**Impact: HIGH (solves user story)**
