import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Navigation, Clock, Loader2 } from "lucide-react";
import { formatLagos, formatLagosDate } from "@/lib/timezone";
import { useAddress } from "@/hooks/useAddress";
import { useVehicleTrips } from "@/hooks/useVehicleProfile";
import { useRealtimeTripUpdates } from "@/hooks/useTripSync";

interface Trip {
  id: string;
  start_time: string;
  end_time: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number | null;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  duration_minutes: number | null;
}

interface VehicleTripsProps {
  deviceId: string;
}

export function VehicleTrips({ deviceId }: VehicleTripsProps) {
  // Enable real-time updates for trips
  useRealtimeTripUpdates(deviceId);

    // Use centralized hook with live polling (30s) and standard filtering
    // Increased limit to 100 to ensure we get enough trips after filtering ghost trips
    const { data: rawTrips, isLoading } = useVehicleTrips(
      deviceId,
      { 
        limit: 100,
        live: true 
      }
    );

  // Map raw trips to component Trip interface
  const trips = useMemo(() => {
    if (!rawTrips) return [];
    
    return rawTrips.map((trip): Trip => ({
      id: trip.id,
      start_time: trip.start_time,
      end_time: trip.end_time || null, // Handle potentially undefined end_time
      start_latitude: trip.start_latitude,
      start_longitude: trip.start_longitude,
      end_latitude: trip.end_latitude,
      end_longitude: trip.end_longitude,
      distance_km: trip.distance_km ?? null,
      avg_speed_kmh: trip.avg_speed == null ? null : Math.round(trip.avg_speed),
      max_speed_kmh: trip.max_speed == null ? null : Math.round(trip.max_speed),
      duration_minutes: trip.duration_seconds ? Math.round(trip.duration_seconds / 60) : null
    }));
  }, [rawTrips]);

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading trip history...
      </div>
    );
  }

  if (!trips || trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Navigation className="h-12 w-12 mb-3 text-muted-foreground/50" />
        <p className="font-medium">No Trips Recorded</p>
        <p className="text-sm text-center mt-1">
          Trip history will appear once the vehicle completes journeys
        </p>
      </div>
    );
  }

    // Group trips by day for display
    const tripsByDay = useMemo(() => {
      if (!trips) return [];
      
      const groups: { date: Date; label: string; trips: Trip[] }[] = [];
      const todayStr = formatLagos(new Date(), "yyyy-MM-dd");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatLagos(yesterday, "yyyy-MM-dd");
      
      trips.forEach(trip => {
        const tripDate = new Date(trip.start_time);
        const tripDateStr = formatLagos(tripDate, "yyyy-MM-dd");
        
        const existingGroup = groups.find(g => formatLagos(g.date, "yyyy-MM-dd") === tripDateStr);
        
        if (existingGroup) {
          existingGroup.trips.push(trip);
        } else {
          let label: string;
          if (tripDateStr === todayStr) {
            label = "Today";
          } else if (tripDateStr === yesterdayStr) {
            label = "Yesterday";
          } else {
            label = formatLagos(tripDate, "EEE, MMM d");
          }
          groups.push({ date: tripDate, label, trips: [trip] });
        }
      });
      
      return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [trips]);

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {tripsByDay.map((group) => (
          <div key={group.label} className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-background/95 backdrop-blur py-1">
              {group.label}
            </div>
            {group.trips.map((trip, dayIndex) => {
              // Trip number is index + 1 within the day (Trip 1 is first trip of the day)
              const tripNumber = dayIndex + 1;
              const isLatest = group.label === "Today" && dayIndex === 0 && tripsByDay[0]?.label === "Today";
              
              return (
                <div
                  key={trip.id}
                  className="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Trip Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">
                        Trip {tripNumber}
                      </span>
                    </div>
                    {isLatest && (
                      <Badge variant="outline" className="text-xs">Latest</Badge>
                    )}
                  </div>

            {/* Trip Times */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Start Time
                </p>
                <p className="text-sm font-medium">
                  {formatLagosDate(trip.start_time, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </p>
              </div>
              {trip.end_time && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    End Time
                  </p>
                  <p className="text-sm font-medium">
                    {formatLagosDate(trip.end_time, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </p>
                </div>
              )}
            </div>

                  {/* Trip Metrics */}
                  <div className="grid grid-cols-4 gap-2 p-2 rounded bg-muted/30">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Distance</p>
                      <p className="text-sm font-semibold text-primary">
                        {trip.distance_km == null ? "--" : (trip.distance_km > 0 ? trip.distance_km.toFixed(1) : "0.0")} km
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
                      <p className="text-sm font-semibold">
                        {formatDuration(trip.duration_minutes)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Speed</p>
                      <p className="text-sm font-semibold">
                        {trip.avg_speed_kmh == null ? "--" : trip.avg_speed_kmh} km/h
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Speed</p>
                      <p className={`text-sm font-semibold ${
                        (trip.max_speed_kmh ?? 0) > 120 ? 'text-destructive' : 
                        (trip.max_speed_kmh ?? 0) >= 80 ? 'text-orange-500' : 'text-green-500'
                      }`}>
                        {trip.max_speed_kmh == null ? "--" : trip.max_speed_kmh} km/h
                      </p>
                    </div>
                  </div>

                  {/* Location Addresses */}
                  <TripAddresses 
                    startLat={trip.start_latitude}
                    startLon={trip.start_longitude}
                    endLat={trip.end_latitude}
                    endLon={trip.end_longitude}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// Component to display trip start and end addresses
function TripAddresses({ 
  startLat, 
  startLon, 
  endLat, 
  endLon 
}: { 
  startLat: number | null; 
  startLon: number | null; 
  endLat: number | null; 
  endLon: number | null; 
}) {
  const hasStart = startLat != null && startLon != null && startLat !== 0 && startLon !== 0;
  const hasEnd = endLat != null && endLon != null && endLat !== 0 && endLon !== 0;

  const { address: startAddress, isLoading: startLoading } = useAddress(hasStart ? startLat : null, hasStart ? startLon : null);
  const { address: endAddress, isLoading: endLoading } = useAddress(hasEnd ? endLat : null, hasEnd ? endLon : null);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-start gap-2">
        <MapPin className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">Start Location</p>
          {startLoading ? (
            <Skeleton className="h-3 w-full" />
          ) : (
            <p className="text-xs text-foreground line-clamp-2">
              {hasStart ? (startAddress || `${startLat!.toFixed(5)}, ${startLon!.toFixed(5)}`) : "Location unavailable"}
            </p>
          )}
        </div>
      </div>
      {hasEnd && (
        <div className="flex items-start gap-2">
          <MapPin className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">End Location</p>
            {endLoading ? (
              <Skeleton className="h-3 w-full" />
            ) : (
              <p className="text-xs text-foreground line-clamp-2">
                {endAddress || `${endLat!.toFixed(5)}, ${endLon!.toFixed(5)}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
