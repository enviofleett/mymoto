import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Navigation, Clock, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
    queryKey: ['vehicle-trips', deviceId],
    queryFn: async () => {
      // Fetch trips from vehicle_trips table (synced from GPS51)
      const { data, error } = await (supabase as any)
        .from('vehicle_trips')
        .select('*')
        .eq('device_id', deviceId)
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Map to Trip interface
      return (data || []).map((trip: any): Trip => {
        const startTime = new Date(trip.start_time);
        const endTime = trip.end_time ? new Date(trip.end_time) : null;
        const durationMs = endTime ? endTime.getTime() - startTime.getTime() : 0;
        const durationMinutes = durationMs / 60000;

        return {
          id: trip.id,
          start_time: trip.start_time,
          end_time: trip.end_time,
          start_latitude: trip.start_latitude,
          start_longitude: trip.start_longitude,
          end_latitude: trip.end_latitude,
          end_longitude: trip.end_longitude,
          distance_km: trip.distance_km || 0,
          avg_speed_kmh: trip.avg_speed ? Math.round(trip.avg_speed) : 0,
          max_speed_kmh: trip.max_speed ? Math.round(trip.max_speed) : 0,
          duration_minutes: Math.round(durationMinutes)
        };
      });
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

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-3">
        {trips.map((trip, index) => (
          <div
            key={trip.id}
            className="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
          >
            {/* Trip Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">
                  Trip #{trips.length - index}
                </span>
              </div>
              {index === 0 && (
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
                  {format(new Date(trip.start_time), 'MMM d, h:mm a')}
                </p>
              </div>
              {trip.end_time && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    End Time
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(trip.end_time), 'MMM d, h:mm a')}
                  </p>
                </div>
              )}
            </div>

            {/* Trip Metrics */}
            <div className="grid grid-cols-3 gap-3 p-2 rounded bg-muted/30">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold text-primary">
                  {trip.distance_km.toFixed(1)} km
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