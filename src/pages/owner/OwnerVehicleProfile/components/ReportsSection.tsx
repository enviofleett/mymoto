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
} from "lucide-react";
import { format, parseISO, isSameDay, differenceInMinutes, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import type { VehicleTrip, VehicleEvent } from "@/hooks/useVehicleProfile";
import type { TripSyncStatus } from "@/hooks/useTripSync";

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
}: ReportsSectionProps) {
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const isFilterActive = !!dateRange?.from;

  // Group trips by date
  const groupedTrips = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    
    const groups: { date: Date; label: string; trips: VehicleTrip[] }[] = [];
    const today = new Date();
    
    trips.forEach(trip => {
      const tripDate = parseISO(trip.start_time);
      const existingGroup = groups.find(g => isSameDay(g.date, tripDate));
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        if (isSameDay(tripDate, today)) {
          label = "Today";
        } else if (isSameDay(tripDate, new Date(today.getTime() - 86400000))) {
          label = "Yesterday";
        } else {
          label = format(tripDate, "EEE, MMM d");
        }
        groups.push({ date: tripDate, label, trips: [trip] });
      }
    });
    
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
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
        {/* Date Filter and Sync Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Reports
            </div>
            {/* Sync Status Indicator */}
            {syncStatus && (
              <div className="flex items-center gap-1.5">
                {isSyncing ? (
                  <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                ) : syncStatus.sync_status === "completed" ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : syncStatus.sync_status === "error" ? (
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
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="trips" className="text-sm">
              <Route className="h-4 w-4 mr-2" />
              Trips
            </TabsTrigger>
            <TabsTrigger value="alarms" className="text-sm">
              <Bell className="h-4 w-4 mr-2" />
              Alarms
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
                      {group.label}
                    </div>
                    {group.trips.map((trip, index) => (
                      <div key={trip.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Trip {index + 1}</span>
                            <a
                              href={getGoogleMapsLink(trip.end_latitude, trip.end_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(parseISO(trip.start_time), 'h:mm a')} - {format(parseISO(trip.end_time), 'h:mm a')}
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <div>
                            <div className="text-sm">{trip.distance_km.toFixed(1)} km</div>
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
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No trips recorded yet</p>
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
