import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Route,
  Bell,
  Calendar,
  CalendarIcon,
  Play,
  ExternalLink,
  MapPin,
  Filter,
  X,
  AlertTriangle,
  Battery,
  Zap,
  Power,
  Info,
  RefreshCw,
  CheckCircle2,
  Radio,
  ArrowRight,
  Settings,
} from "lucide-react";
import { format, parseISO, isSameDay, differenceInMinutes, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import type { VehicleTrip, VehicleEvent } from "@/hooks/useVehicleProfile";
import type { TripSyncStatus } from "@/hooks/useTripSync";
import { useAddress } from "@/hooks/useAddress";
import { useAuth } from "@/contexts/AuthContext";
import { VehicleNotificationSettings } from "@/components/fleet/VehicleNotificationSettings";
import { TripSyncProgress } from "@/components/fleet/TripSyncProgress";
import { formatToLagosTime } from "@/utils/timezone";

interface ReportsSectionProps {
  deviceId: string;
  trips: VehicleTrip[] | undefined;
  events: VehicleEvent[] | undefined;
  tripsLoading: boolean;
  eventsLoading: boolean;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onPlayTrip: (trip: VehicleTrip) => void;
  syncStatus?: TripSyncStatus | null;
  isSyncing?: boolean;
  onForceSync?: () => void;
  isRealtimeActive?: boolean;
  isAutoSyncing?: boolean;
}

export function ReportsSection({
  deviceId,
  trips,
  events,
  tripsLoading,
  eventsLoading,
  dateRange,
  onDateRangeChange,
  onPlayTrip,
  syncStatus,
  isSyncing = false,
  onForceSync,
  isRealtimeActive = false,
  isAutoSyncing = false,
}: ReportsSectionProps) {
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const isFilterActive = !!dateRange?.from;
  const { user } = useAuth();
  
  // CRITICAL DEBUG: Log trips prop when it changes (development only)
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

  // Group trips by date and sort within each day (earliest first = Trip 1)
  const groupedTrips = useMemo(() => {
    if (!trips || trips.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[ReportsSection] No trips provided to group');
      }
      return [];
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[ReportsSection] Grouping', trips.length, 'trips');
    }
    
    // CRITICAL FIX: Include ALL trips that have start_time and end_time, even if coordinates are 0
    // This allows trips with missing GPS data to still be displayed
    let validTrips = trips.filter(trip => {
      // Only require start_time and end_time - coordinates can be 0 (missing GPS data)
      return trip.start_time && trip.end_time;
    });
    
    // FIX: Additional deduplication at UI level (defense in depth)
    // Remove any remaining duplicates based on trip ID or start_time/end_time
    const seenTripIds = new Set<string>();
    const seenTripKeys = new Set<string>();
    const deduplicatedTrips: VehicleTrip[] = [];
    
    validTrips.forEach(trip => {
      // Check by ID first (most reliable)
      if (trip.id && seenTripIds.has(trip.id)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[ReportsSection] Duplicate trip ID detected: ${trip.id}, skipping`);
        }
        return;
      }
      
      // Check by start_time/end_time combination
      const tripKey = `${trip.start_time}|${trip.end_time}`;
      if (seenTripKeys.has(tripKey)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[ReportsSection] Duplicate trip time detected: ${trip.start_time} to ${trip.end_time}, skipping trip ${trip.id}`);
        }
        return;
      }
      
      // Add to seen sets and include in result
      if (trip.id) seenTripIds.add(trip.id);
      seenTripKeys.add(tripKey);
      deduplicatedTrips.push(trip);
    });
    
    if (deduplicatedTrips.length < validTrips.length) {
      const duplicatesRemoved = validTrips.length - deduplicatedTrips.length;
      console.warn(`[ReportsSection] Removed ${duplicatesRemoved} duplicate trip(s) at UI level (${validTrips.length} -> ${deduplicatedTrips.length})`);
    }
    
    validTrips = deduplicatedTrips;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[ReportsSection] Trip filtering:', {
        total: trips.length,
        valid: validTrips.length,
        filteredOut: trips.length - validTrips.length
      });
      
      console.log('[ReportsSection] Valid trips after filtering:', validTrips.length);
      
      if (validTrips.length > 0) {
        const dates = validTrips.map(t => new Date(t.start_time).toISOString().split('T')[0]);
        const uniqueDates = [...new Set(dates)];
        console.log('[ReportsSection] Trip dates found:', uniqueDates.sort().reverse());
      }
    }
    
    const groups: { date: Date; label: string; trips: VehicleTrip[] }[] = [];
    
    // FIX: Use Africa/Lagos timezone for date comparisons (consistent with app timezone)
    // Get current date in Africa/Lagos timezone
    const now = new Date();
    const lagosToday = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    const todayDateStr = lagosToday.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Get yesterday in Lagos timezone
    const lagosYesterday = new Date(lagosToday);
    lagosYesterday.setDate(lagosYesterday.getDate() - 1);
    const yesterdayDateStr = lagosYesterday.toISOString().split('T')[0];
    
    validTrips.forEach(trip => {
      // FIX: Extract date from trip start_time and convert to Lagos timezone for grouping
      // Parse the trip start_time and convert to Lagos timezone
      const tripDate = new Date(trip.start_time);
      const tripDateInLagos = new Date(tripDate.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
      const tripDateStr = tripDateInLagos.toISOString().split('T')[0]; // YYYY-MM-DD in Lagos timezone
      
      // Use the date string as the key for grouping (consistent timezone)
      const [year, month, day] = tripDateStr.split('-').map(Number);
      const tripDateForGrouping = new Date(Date.UTC(year, month - 1, day));
      
      // Find existing group by comparing date strings (timezone-aware)
      const existingGroup = groups.find(g => {
        const groupDateStr = g.date.toISOString().split('T')[0];
        return groupDateStr === tripDateStr;
      });
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        
        // Compare with today/yesterday using Lagos timezone dates
        if (tripDateStr === todayDateStr) {
          label = "Today";
        } else if (tripDateStr === yesterdayDateStr) {
          label = "Yesterday";
        } else {
          // Format using the trip date in Lagos timezone for display
          label = format(tripDateInLagos, "EEE, MMM d");
        }
        groups.push({ date: tripDateForGrouping, label, trips: [trip] });
        if (process.env.NODE_ENV === 'development') {
          console.log('[ReportsSection] Created group:', label, 'date:', tripDateStr, 'trips:', 1);
        }
      }
    });
    
      // Sort trips within each day by start_time ASC (earliest first = Trip 1)
      groups.forEach(group => {
        group.trips.sort((a, b) => {
          const timeA = new Date(a.start_time).getTime();
          const timeB = new Date(b.start_time).getTime();
          
          // Primary sort: by start_time
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          
          // If start_time is identical, sort by end_time
          const endTimeA = new Date(a.end_time).getTime();
          const endTimeB = new Date(b.end_time).getTime();
          return endTimeA - endTimeB;
        });
        
        // Calculate trip quality score (higher = better)
        const getTripQualityScore = (trip: VehicleTrip): number => {
          let score = 0;
          
          // Has valid start coordinates (+10 points)
          if (trip.start_latitude && trip.start_longitude && 
              trip.start_latitude !== 0 && trip.start_longitude !== 0) {
            score += 10;
          }
          
          // Has valid end coordinates (+10 points)
          if (trip.end_latitude && trip.end_longitude && 
              trip.end_latitude !== 0 && trip.end_longitude !== 0) {
            score += 10;
          }
          
          // Has distance data (+5 points)
          if (trip.distance_km && trip.distance_km > 0) {
            score += 5;
          }
          
          // Longer duration = more complete trip (+1 point per minute, max 20)
          const duration = trip.duration_seconds 
            ? trip.duration_seconds / 60 
            : (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 60000;
          score += Math.min(Math.floor(duration), 20);
          
          return score;
        };
        
        // Filter out overlapping trips - keep the one with better quality
        const filteredTrips: VehicleTrip[] = [];
        const tripStartTimes = new Map<VehicleTrip, number>();
        const tripEndTimes = new Map<VehicleTrip, number>();
        
        // Pre-calculate times for efficiency
        group.trips.forEach(trip => {
          tripStartTimes.set(trip, new Date(trip.start_time).getTime());
          tripEndTimes.set(trip, new Date(trip.end_time).getTime());
        });
        
        group.trips.forEach(trip => {
          const tripStart = tripStartTimes.get(trip)!;
          const tripEnd = tripEndTimes.get(trip)!;
          
          // Skip invalid trips (end before start)
          if (tripEnd < tripStart) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[ReportsSection] Skipping invalid trip: end time before start time`, trip);
            }
            return;
          }
          
          // Check for overlaps with already included trips
          let hasOverlap = false;
          let shouldKeep = true;
          
          for (const existingTrip of filteredTrips) {
            const existingStart = tripStartTimes.get(existingTrip)!;
            const existingEnd = tripEndTimes.get(existingTrip)!;
            
            // Check if trips overlap (one starts before the other ends)
            const overlaps = (tripStart < existingEnd && tripEnd > existingStart);
            
            if (overlaps) {
              hasOverlap = true;
              
              // Compare quality scores - keep the better one
              const tripScore = getTripQualityScore(trip);
              const existingScore = getTripQualityScore(existingTrip);
              
              if (tripScore > existingScore) {
                // This trip is better - remove the existing one and keep this
                const index = filteredTrips.indexOf(existingTrip);
                filteredTrips.splice(index, 1);
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[ReportsSection] Removing overlapping trip (score: ${existingScore}) in favor of better trip (score: ${tripScore})`);
                }
              } else {
                // Existing trip is better or equal - skip this one
                shouldKeep = false;
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[ReportsSection] Skipping overlapping trip (score: ${tripScore}) - keeping existing trip (score: ${existingScore})`);
                }
                break;
              }
            }
          }
          
          if (shouldKeep && !hasOverlap) {
            filteredTrips.push(trip);
          } else if (shouldKeep && hasOverlap) {
            // We already removed the overlapping trip above, so add this one
            filteredTrips.push(trip);
          }
        });
        
        // Replace trips with filtered list
        const removedCount = group.trips.length - filteredTrips.length;
        if (removedCount > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ReportsSection] Removed ${removedCount} overlapping trip(s) from ${group.label}`);
          }
        }
        group.trips = filteredTrips;
        
        // FIX: Validate trip ordering after filtering
        if (process.env.NODE_ENV === 'development') {
          for (let i = 1; i < group.trips.length; i++) {
            const prevTrip = group.trips[i - 1];
            const currentTrip = group.trips[i];
            const prevEnd = tripEndTimes.get(prevTrip)!;
            const currentStart = tripStartTimes.get(currentTrip)!;
            
            if (prevEnd > currentStart) {
              console.warn(`[ReportsSection] CONTRADICTION DETECTED: Trip ${i} ends at ${prevTrip.end_time} but Trip ${i + 1} starts at ${currentTrip.start_time} (overlap of ${(prevEnd - currentStart) / 1000}s)`);
            }
          }
        }
      });
    
    // Sort days by date DESC (latest day first)
    const sortedGroups = groups.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[ReportsSection] Final grouped days:', sortedGroups.map(g => 
        `${g.label} (${g.trips.length} trips, date: ${g.date.toISOString().split('T')[0]})`
      ));
      
      // CRITICAL DEBUG: Verify all trips are included
      const totalTripsInGroups = sortedGroups.reduce((sum, g) => sum + g.trips.length, 0);
      if (totalTripsInGroups !== validTrips.length) {
        console.error('[ReportsSection] TRIP COUNT MISMATCH!', {
          validTrips: validTrips.length,
          groupedTrips: totalTripsInGroups,
          missing: validTrips.length - totalTripsInGroups
        });
      }
    }
    
    return sortedGroups;
  }, [trips]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    const groups: { date: Date; label: string; events: VehicleEvent[] }[] = [];
    const today = new Date();
    
    events.forEach(event => {
      const eventDate = parseISO(event.created_at);
      const existingGroup = groups.find(g => isSameDay(g.date, eventDate));
      
      if (existingGroup) {
        existingGroup.events.push(event);
      } else {
        let label: string;
        if (isSameDay(eventDate, today)) {
          label = "Today";
        } else if (isSameDay(eventDate, new Date(today.getTime() - 86400000))) {
          label = "Yesterday";
        } else {
          label = format(eventDate, "EEE, MMM d");
        }
        groups.push({ date: eventDate, label, events: [event] });
      }
    });
    
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events]);

  const getGoogleMapsLink = (lat: number, lon: number) => 
    `https://www.google.com/maps?q=${lat},${lon}`;

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "overspeed":
        return <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />;
      case "low_battery":
        return <Battery className="h-4 w-4 text-orange-500 mt-0.5" />;
      case "ignition_on":
        return <Zap className="h-4 w-4 text-green-500 mt-0.5" />;
      case "ignition_off":
        return <Power className="h-4 w-4 text-muted-foreground mt-0.5" />;
      case "offline":
        return <Info className="h-4 w-4 text-red-500 mt-0.5" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground mt-0.5" />;
    }
  };

  const allTripsCount = trips?.length ?? 0;
  
  // Calculate pending trips countdown if syncing
  const pendingTripsCountdown = useMemo(() => {
    if (!syncStatus || syncStatus.sync_status !== 'processing') {
      return null;
    }
    
    const tripsTotal = syncStatus.trips_total ?? 0;
    const tripsProcessed = syncStatus.trips_processed ?? 0;
    
    if (tripsTotal === 0 || tripsProcessed >= tripsTotal) {
      return null; // No pending trips or sync complete
    }
    
    const remaining = tripsTotal - tripsProcessed;
    return remaining;
  }, [syncStatus]);
  const allTripsDistance = trips?.reduce((sum, t) => sum + t.distance_km, 0) ?? 0;

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        {/* Trip Sync Progress */}
        <TripSyncProgress deviceId={deviceId} isSyncing={isSyncing || isAutoSyncing} />

        {/* Date Filter and Sync Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Reports
            </div>
            {/* Sync Status Indicator */}
            {(syncStatus || isAutoSyncing) && (
              <div className="flex items-center gap-1.5">
                {isSyncing || isAutoSyncing ? (
                  <div className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                    {isAutoSyncing && (
                      <span className="text-xs text-muted-foreground">Auto-syncing...</span>
                    )}
                  </div>
                ) : syncStatus?.sync_status === "completed" ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : syncStatus?.sync_status === "error" ? (
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                ) : null}
                {isRealtimeActive && (
                  <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Force Sync Button */}
            {onForceSync && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onForceSync}
                disabled={isSyncing}
                title="Force sync last 7 days of trips"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")} />
                Sync
              </Button>
            )}
            {/* Debug: Show trips count */}
            {process.env.NODE_ENV === 'development' && (
              <div className="text-xs text-muted-foreground px-2">
                {trips?.length || 0} trips
              </div>
            )}
            {isFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onDateRangeChange(undefined)}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            <Popover open={isDateFilterOpen} onOpenChange={setIsDateFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 px-3 text-xs",
                    isFilterActive && "border-primary text-primary"
                  )}
                >
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {isFilterActive
                    ? `${format(dateRange.from!, 'MMM d')}${dateRange.to ? ` - ${format(dateRange.to, 'MMM d')}` : ''}`
                    : 'Filter by date'
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    onDateRangeChange(range);
                    if (range?.from && range?.to) {
                      setIsDateFilterOpen(false);
                    }
                  }}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Sync Status Details - Only show when not processing (to avoid duplication with progress card) */}
        {syncStatus && syncStatus.last_sync_at && syncStatus.sync_status !== 'processing' && (
          <div className="mb-3 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                Last synced: {formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true })}
              </span>
              {syncStatus.trips_processed > 0 && (
                <span className="text-green-600 font-medium">
                  +{syncStatus.trips_processed} trip{syncStatus.trips_processed !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {syncStatus.sync_status === "error" && syncStatus.error_message && (
              <div className="mt-1 text-red-500 text-xs">
                Error: {syncStatus.error_message}
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="trips" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="trips" className="text-sm">
              <Route className="h-4 w-4 mr-2" />
              Trips
            </TabsTrigger>
            <TabsTrigger value="alarms" className="text-sm">
              <Bell className="h-4 w-4 mr-2" />
              Alarms
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-sm">
              <Settings className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Trips Tab */}
          <TabsContent value="trips" className="mt-0">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {tripsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : groupedTrips.length > 0 ? (
                <>
                  {/* Debug info - remove in production */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded mb-2">
                      Debug: {trips?.length || 0} trips received, {groupedTrips.length} days grouped
                    </div>
                  )}
                  {groupedTrips.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {group.label} ({group.trips.length} trip{group.trips.length !== 1 ? 's' : ''})
                      </div>
                      {group.trips.map((trip, index) => (
                        <TripCard
                          key={trip.id}
                          trip={trip}
                          index={index}
                          onPlayTrip={onPlayTrip}
                          previousTrip={index > 0 ? group.trips[index - 1] : undefined}
                          nextTrip={index < group.trips.length - 1 ? group.trips[index + 1] : undefined}
                        />
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No trips recorded yet</p>
                  {process.env.NODE_ENV === 'development' && trips && trips.length > 0 && (
                    <p className="text-xs text-red-500 mt-2">
                      Debug: {trips.length} trips received but none grouped. Check console.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {pendingTripsCountdown ? 'Syncing trips' : 'Total trips'}
              </span>
              <div className="flex items-center gap-2">
                {pendingTripsCountdown ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground px-2 py-1 bg-primary/10 text-primary rounded-full font-medium tabular-nums animate-pulse">
                      {pendingTripsCountdown} remaining
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({syncStatus?.trips_processed ?? 0}/{syncStatus?.trips_total ?? 0} processed)
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="font-medium">{allTripsCount} trips</span>
                    <span className="text-primary ml-2">{allTripsDistance.toFixed(1)} km</span>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Alarms Tab */}
          <TabsContent value="alarms" className="mt-0">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {eventsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : groupedEvents.length > 0 ? (
                groupedEvents.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.events.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "p-3 rounded-lg",
                          event.severity === 'error' || event.severity === 'warning' 
                            ? "bg-yellow-500/10" 
                            : "bg-muted/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {getEventIcon(event.event_type)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground">{event.title}</div>
                            <div className="text-sm text-muted-foreground truncate">{event.message}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatToLagosTime(event.created_at, {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No alerts recorded</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <span className="text-sm text-muted-foreground">Total alerts</span>
              <div>
                <span className="font-medium">{events?.length ?? 0}</span>
                <span className="text-yellow-500 ml-2">
                  {events?.filter(a => a.severity === 'warning' || a.severity === 'error').length ?? 0} warnings
                </span>
              </div>
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-0">
            {!user?.id ? (
              <div className="text-center py-6 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Please sign in to configure notifications</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <VehicleNotificationSettings deviceId={deviceId} userId={user.id} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Trip card component with address display
function TripCard({ 
  trip, 
  index, 
  onPlayTrip,
  previousTrip,
  nextTrip
}: { 
  trip: VehicleTrip; 
  index: number; 
  onPlayTrip: (trip: VehicleTrip) => void;
  previousTrip?: VehicleTrip;
  nextTrip?: VehicleTrip;
}) {
  // Only fetch addresses if coordinates are valid (not 0,0)
  const hasValidStartCoords = trip.start_latitude && trip.start_longitude && 
                             trip.start_latitude !== 0 && trip.start_longitude !== 0;
  const hasValidEndCoords = trip.end_latitude && trip.end_longitude && 
                             trip.end_latitude !== 0 && trip.end_longitude !== 0;
  
  // Check if trip can be played back (needs valid GPS coordinates)
  const canPlayback = hasValidStartCoords && hasValidEndCoords;
  
  // FIX: Detect contradictions with adjacent trips
  const hasContradiction = useMemo(() => {
    if (!previousTrip && !nextTrip) return false;
    
    const tripStart = new Date(trip.start_time).getTime();
    const tripEnd = new Date(trip.end_time).getTime();
    
    // Check if this trip overlaps with previous trip
    if (previousTrip) {
      const prevEnd = new Date(previousTrip.end_time).getTime();
      if (prevEnd > tripStart) {
        return true; // Previous trip ends after this one starts
      }
    }
    
    // Check if this trip overlaps with next trip
    if (nextTrip) {
      const nextStart = new Date(nextTrip.start_time).getTime();
      if (tripEnd > nextStart) {
        return true; // This trip ends after next one starts
      }
    }
    
    // Check if end time is before start time (invalid trip)
    if (tripEnd < tripStart) {
      return true;
    }
    
    return false;
  }, [trip, previousTrip, nextTrip]);
  
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
            {hasContradiction && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Time conflict
              </Badge>
            )}
            {!canPlayback && !hasContradiction && (
              <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
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
            {formatToLagosTime(trip.start_time, {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })} - {formatToLagosTime(trip.end_time, {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
            {hasContradiction && (
              <div className="text-destructive mt-1 text-[10px] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  {previousTrip && new Date(previousTrip.end_time).getTime() > new Date(trip.start_time).getTime() 
                    ? `Overlaps with Trip ${index} (ends ${formatDistanceToNow(new Date(previousTrip.end_time), { addSuffix: true })})`
                    : nextTrip && new Date(trip.end_time).getTime() > new Date(nextTrip.start_time).getTime()
                    ? `Overlaps with Trip ${index + 2} (starts ${formatDistanceToNow(new Date(nextTrip.start_time), { addSuffix: true })})`
                    : 'Invalid time range'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <div className="text-sm font-medium">
              {trip.distance_km > 0 ? (
                <>
                  {trip.distance_km.toFixed(1)} km
                  {/* Show estimated indicator if distance was calculated from duration */}
                  {!hasValidStartCoords || !hasValidEndCoords ? (
                    <span className="text-xs text-muted-foreground ml-1">(est.)</span>
                  ) : null}
                </>
              ) : (
                '0.0 km'
              )}
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
            onClick={() => canPlayback && onPlayTrip(trip)}
            disabled={!canPlayback}
            title={canPlayback ? "Play trip" : "GPS coordinates incomplete - cannot playback"}
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
