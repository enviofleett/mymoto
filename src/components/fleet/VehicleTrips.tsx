import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";

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
      // Fetch position history to calculate trips
      const { data, error } = await (supabase as any)
        .from('position_history')
        .select('id, gps_time, latitude, longitude, speed, ignition_on')
        .eq('device_id', deviceId)
        .order('gps_time', { ascending: false })
        .limit(500);

      if (error) throw error;
      
      // Group positions into trips based on ignition
      const tripsList: Trip[] = [];
      let currentTrip: any = null;
      let tripDistance = 0;
      let tripSpeeds: number[] = [];
      let prevPos: any = null;
      
      const positions = (data || []).reverse(); // Oldest first
      
      positions.forEach((pos: any) => {
        if (pos.ignition_on && !currentTrip) {
          // Start new trip
          currentTrip = {
            start_time: pos.gps_time,
            start_latitude: pos.latitude,
            start_longitude: pos.longitude
          };
          tripDistance = 0;
          tripSpeeds = [];
        }
        
        if (currentTrip && pos.speed > 0 && prevPos) {
          // Calculate distance
          const R = 6371;
          const dLat = (pos.latitude - prevPos.latitude) * Math.PI / 180;
          const dLon = (pos.longitude - prevPos.longitude) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(prevPos.latitude * Math.PI / 180) * Math.cos(pos.latitude * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const d = R * c;
          
          if (d < 5) {
            tripDistance += d;
            tripSpeeds.push(pos.speed);
          }
        }
        
        if (!pos.ignition_on && currentTrip && tripDistance > 0.5) {
          // End trip
          const durationMs = new Date(pos.gps_time).getTime() - new Date(currentTrip.start_time).getTime();
          const durationMinutes = durationMs / 60000;
          
          tripsList.push({
            id: `trip-${tripsList.length}`,
            start_time: currentTrip.start_time,
            end_time: pos.gps_time,
            start_latitude: currentTrip.start_latitude,
            start_longitude: currentTrip.start_longitude,
            end_latitude: pos.latitude,
            end_longitude: pos.longitude,
            distance_km: Math.round(tripDistance * 10) / 10,
            avg_speed_kmh: tripSpeeds.length > 0 ? Math.round(tripSpeeds.reduce((a, b) => a + b, 0) / tripSpeeds.length) : 0,
            max_speed_kmh: tripSpeeds.length > 0 ? Math.max(...tripSpeeds) : 0,
            duration_minutes: Math.round(durationMinutes)
          });
          
          currentTrip = null;
        }
        
        prevPos = pos;
      });

      return tripsList.reverse().slice(0, 20); // Latest first
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

            {/* Location Coordinates */}
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-3 w-3 text-green-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Start</p>
                  <p className="text-xs font-mono">
                    {trip.start_latitude.toFixed(5)}, {trip.start_longitude.toFixed(5)}
                  </p>
                </div>
              </div>
              {trip.end_latitude && trip.end_longitude && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3 w-3 text-red-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">End</p>
                    <p className="text-xs font-mono">
                      {trip.end_latitude.toFixed(5)}, {trip.end_longitude.toFixed(5)}
                    </p>
                  </div>
                </div>
              )}
            </div>

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