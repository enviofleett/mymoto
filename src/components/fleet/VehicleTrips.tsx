import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Navigation, Clock, TrendingUp, Loader2 } from "lucide-react";
import { formatLagos, formatLagosDate } from "@/lib/timezone";
import { useAddress } from "@/hooks/useAddress";

interface Trip {
  id: string;
  start_time: string;
  end_time: string | null;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number;
  avg_speed_kmh: number;
  max_speed_kmh: number;
  duration_minutes: number | null;
}

interface VehicleTripsProps {
  deviceId: string;
}

export function VehicleTrips({ deviceId }: VehicleTripsProps) {
  const { data: trips, isLoading } = useQuery({
    queryKey: ['vehicle-trips-direct', deviceId],
    queryFn: async () => {
      // Fetch trips DIRECTLY from vehicle_trips table (synced from GPS51)
      // This ensures 100% match with GPS51 platform
      // @ts-ignore
      const { data, error } = await supabase
        .from('vehicle_trips' as any)
        .select('*')
        .eq('device_id', deviceId)
        .eq('source', 'gps51') // STRICT PARITY: Only show trips from GPS51
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Map to Trip interface - GPS51 data is already accurate, no calculations needed
      const validTrips = (data || [])
        .filter((trip: any) => {
          // Ghost Trip Filtering
          const distance = trip.distance_km || 0;
          const duration = trip.duration_seconds || 0;
          
          // 1. Filter out short trips with negligible distance (Ignition flicker)
          // Threshold: < 0.1 km distance AND < 2 minutes duration
          if (distance < 0.1 && duration < 120) return false;

          // 2. REMOVED: Filter out zero distance trips (Static drift)
          // We MUST allow zero distance trips if they are long enough (handled by rule #1) because they represent "Idling"
          // if (distance === 0) return false;

          // 3. Filter out unrealistic speed (GPS Jump)
          // Threshold: > 250 km/h
          if (duration > 0) {
            const hours = duration / 3600;
            const speed = distance / hours;
            if (speed > 250) return false;
          }

          return true;
        })
        .map((trip: any): Trip => {
          const startTime = new Date(trip.start_time);
          const endTime = trip.end_time ? new Date(trip.end_time) : null;
          const durationMinutes = trip.duration_seconds ? trip.duration_seconds / 60 : null;

          // GPS51 data is already accurate - use it directly (NO calculations)
          return {
            id: trip.id,
            start_time: trip.start_time,
            end_time: trip.end_time,
            start_latitude: trip.start_latitude,
            start_longitude: trip.start_longitude,
            end_latitude: trip.end_latitude,
            end_longitude: trip.end_longitude,
            distance_km: trip.distance_km || 0, // Synced from GPS51
            avg_speed_kmh: Math.round(trip.avg_speed || 0),
            max_speed_kmh: Math.round(trip.max_speed || 0),
            duration_minutes: durationMinutes ? Math.round(durationMinutes) : null
          };
        });

      // Group trips by day and sort each day's trips by start_time ASC (earliest first)
      const tripsByDay = new Map<string, Trip[]>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      validTrips.forEach(trip => {
        const tripDate = new Date(trip.start_time);
        tripDate.setHours(0, 0, 0, 0);
        const dayKey = tripDate.toISOString().split('T')[0];
        
        if (!tripsByDay.has(dayKey)) {
          tripsByDay.set(dayKey, []);
        }
        tripsByDay.get(dayKey)!.push(trip);
      });

      // Sort trips within each day by start_time ASC (earliest first = Trip 1)
      tripsByDay.forEach((dayTrips, dayKey) => {
        dayTrips.sort((a, b) => 
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
      });

      // Flatten back to array, keeping days in descending order (today first)
      const sortedTrips: Trip[] = [];
      const sortedDays = Array.from(tripsByDay.entries()).sort((a, b) => 
        b[0].localeCompare(a[0]) // Latest day first
      );

      sortedDays.forEach(([dayKey, dayTrips]) => {
        sortedTrips.push(...dayTrips);
      });

      return sortedTrips;
    },
    enabled: !!deviceId,
    refetchInterval: 60000
  });

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    trips.forEach(trip => {
      const tripDate = new Date(trip.start_time);
      tripDate.setHours(0, 0, 0, 0);
      const existingGroup = groups.find(g => g.date.getTime() === tripDate.getTime());
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        if (tripDate.getTime() === today.getTime()) {
          label = "Today";
        } else if (tripDate.getTime() === today.getTime() - 86400000) {
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
                  <div className="grid grid-cols-3 gap-3 p-2 rounded bg-muted/30">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Distance</p>
                      <p className="text-sm font-semibold text-primary">
                        {trip.distance_km > 0 ? trip.distance_km.toFixed(1) : '0.0'} km
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-semibold">
                        {formatDuration(trip.duration_minutes)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Speed</p>
                      <p className="text-sm font-semibold">
                        {trip.avg_speed_kmh} km/h
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

                  {/* Max Speed Alert */}
                  {trip.max_speed_kmh > 100 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-500">
                      <TrendingUp className="h-3 w-3" />
                      <span>Max speed: {trip.max_speed_kmh} km/h</span>
                    </div>
                  )}
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
  startLat: number; 
  startLon: number; 
  endLat: number | null; 
  endLon: number | null; 
}) {
  const { address: startAddress, isLoading: startLoading } = useAddress(startLat, startLon);
  const { address: endAddress, isLoading: endLoading } = useAddress(endLat, endLon);

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
              {startAddress || `${startLat.toFixed(5)}, ${startLon.toFixed(5)}`}
            </p>
          )}
        </div>
      </div>
      {endLat && endLon && (
        <div className="flex items-start gap-2">
          <MapPin className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">End Location</p>
            {endLoading ? (
              <Skeleton className="h-3 w-full" />
            ) : (
              <p className="text-xs text-foreground line-clamp-2">
                {endAddress || `${endLat.toFixed(5)}, ${endLon.toFixed(5)}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}