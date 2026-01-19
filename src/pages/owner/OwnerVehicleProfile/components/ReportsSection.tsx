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
  isAutoSyncing?: boolean;
  onForceSync?: () => void;
  isRealtimeActive?: boolean;
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
  isAutoSyncing = false,
  onForceSync,
  isRealtimeActive = false,
}: ReportsSectionProps) {
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const isFilterActive = !!dateRange?.from;
  const { user } = useAuth();

  // CRITICAL DEBUG: Log trips prop when it changes
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
    const validTrips = trips.filter(trip => {
      // Only require start_time and end_time - coordinates can be 0 (missing GPS data)
      return trip.start_time && trip.end_time;
    });

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
    // Use current date in UTC to avoid timezone issues
    const now = new Date();
    const today = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    
    validTrips.forEach(trip => {
      // CRITICAL FIX: Parse date directly from ISO string to avoid timezone conversion issues
      // Extract YYYY-MM-DD from ISO string (e.g., "2026-01-14T06:36:33+00:00" -> "2026-01-14")
      const tripDateStr = trip.start_time.split('T')[0];
      const [year, month, day] = tripDateStr.split('-').map(Number);
      const tripDateUTC = new Date(Date.UTC(year, month - 1, day));
      
      // Find existing group by comparing UTC dates
      const existingGroup = groups.find(g => {
        return g.date.getTime() === tripDateUTC.getTime();
      });
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        // Compare with today using UTC dates
        const todayUTC = new Date(Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate()
        ));
        const yesterdayUTC = new Date(todayUTC);
        yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
        
        if (tripDateUTC.getTime() === todayUTC.getTime()) {
          label = "Today";
        } else if (tripDateUTC.getTime() === yesterdayUTC.getTime()) {
          label = "Yesterday";
        } else {
          // Format using the original trip date for display
          const tripDateForDisplay = new Date(trip.start_time);
          label = format(tripDateForDisplay, "EEE, MMM d");
        }
        groups.push({ date: tripDateUTC, label, trips: [trip] });
        if (process.env.NODE_ENV === 'development') {
          console.log('[ReportsSection] Created group:', label, 'date:', tripDateStr, 'trips:', 1);
        }
      }
    });
    
    // Sort trips within each day by start_time ASC (earliest first = Trip 1)
    groups.forEach(group => {
      group.trips.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
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
  const allTripsDistance = trips?.reduce((sum, t) => sum + t.distance_km, 0) ?? 0;

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        {/* Trip Sync Progress */}
        <TripSyncProgress deviceId={deviceId} />

        {/* Date Filter and Sync Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Reports
            </div>
            {/* Sync Status Indicator */}
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

        {/* Sync Status Details */}
        {syncStatus && syncStatus.last_sync_at && (
          <div className="mb-3 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                Last synced: {formatDistanceToNow(new Date(syncStatus.last_sync_at), { addSuffix: true })}
              </span>
              {syncStatus.trips_processed > 0 && (
                <span className="text-green-600">
                  +{syncStatus.trips_processed} trips
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
              <span className="text-sm text-muted-foreground">Total trips</span>
              <div>
                <span className="font-medium">{allTripsCount} trips</span>
                <span className="text-primary ml-2">{allTripsDistance.toFixed(1)} km</span>
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
                              {new Date(event.created_at).toLocaleString('en-US', {
                                timeZone: 'Africa/Lagos',
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
            {new Date(trip.start_time).toLocaleString('en-US', {
              timeZone: 'Africa/Lagos',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })} - {new Date(trip.end_time).toLocaleString('en-US', {
              timeZone: 'Africa/Lagos',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
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
            disabled={!canPlayback}
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
