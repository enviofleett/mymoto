import { useState, useMemo, useRef, useEffect } from "react";
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
  CalendarIcon,
  Play,
  ExternalLink,
  MapPin,
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
import { format, parseISO, isSameDay, differenceInMinutes, formatDistanceToNow, isToday, isYesterday } from "date-fns";
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
  
  // CRITICAL DEBUG: Log trips prop when it changes (development only) - MOVED TO useEffect to prevent render-loop logging
  useEffect(() => {
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
  }, [trips, tripsLoading, dateRange, deviceId]);

  // Group trips by date and sort within each day (earliest first = Trip 1)
  // Uses LOCAL TIME to fix UTC/Timezone display bug
  const groupedTrips = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    
    // Filter valid trips
    const validTrips = trips.filter(trip => trip.start_time && trip.end_time);
    
    const groups: { date: Date; label: string; trips: VehicleTrip[] }[] = [];
    
    validTrips.forEach(trip => {
      // FIX: Use parseISO to handle the date string correctly in local browser time
      const tripDate = parseISO(trip.start_time);
      
      // Find existing group by checking if it's the same Local Day
      const existingGroup = groups.find(g => isSameDay(g.date, tripDate));
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        
        if (isToday(tripDate)) {
          label = "Today";
        } else if (isYesterday(tripDate)) {
          label = "Yesterday";
        } else {
          label = format(tripDate, "EEE, MMM d");
        }
        
        groups.push({ date: tripDate, label, trips: [trip] });
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
    
    return sortedGroups;
  }, [trips]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    const groups: { date: Date; label: string; events: VehicleEvent[] }[] = [];
    
    events.forEach(event => {
      const eventDate = parseISO(event.created_at);
      const existingGroup = groups.find(g => isSameDay(g.date, eventDate));
      
      if (existingGroup) {
        existingGroup.events.push(event);
      } else {
        let label: string;
        if (isToday(eventDate)) {
          label = "Today";
        } else if (isYesterday(eventDate)) {
          label = "Yesterday";
        } else {
          label = format(eventDate, "EEE, MMM d");
        }
        groups.push({ date: eventDate, label, events: [event] });
      }
    });
    
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events]);

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
                groupedTrips.map((group) => (
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
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No trips recorded {isFilterActive ? 'for this period' : 'yet'}</p>
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
                              {format(parseISO(event.created_at), 'h:mm a')}
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
  const hasValidStartCoords = trip.start_latitude && trip.start_longitude && 
                             trip.start_latitude !== 0 && trip.start_longitude !== 0;
  const hasValidEndCoords = trip.end_latitude && trip.end_longitude && 
                           trip.end_latitude !== 0 && trip.end_longitude !== 0;
  
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
            {!canPlayback && (
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
            {format(parseISO(trip.start_time), 'h:mm a')} - {format(parseISO(trip.end_time), 'h:mm a')}
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <div className="text-sm font-medium">
              {trip.distance_km > 0 ? (
                <>
                  {trip.distance_km.toFixed(1)} km
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
