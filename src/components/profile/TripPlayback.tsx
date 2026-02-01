import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatLagos } from "@/lib/timezone";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Gauge, 
  Clock,
  MapPin,
  Navigation,
  X,
  Route,
  Timer,
  StopCircle
} from "lucide-react";

// Fix for default Leaflet marker icons in React
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom vehicle icon with rotation
const createVehicleIcon = (heading: number = 0) => {
  return L.divIcon({
    html: `
      <div style="transform: rotate(${heading}deg); display: flex; align-items: center; justify-content: center;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1"/>
        </svg>
      </div>
    `,
    className: "vehicle-marker",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface PositionPoint {
  id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  gps_time: string;
  ignition_on: boolean;
}

interface TripPlaybackProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

// Component to handle map bounds
function MapBounds({ positions }: { positions: PositionPoint[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(
        positions.map(p => [p.latitude, p.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);
  
  return null;
}

export function TripPlayback({ deviceId, deviceName, onClose }: TripPlaybackProps) {
  const [positions, setPositions] = useState<PositionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [dateRange, setDateRange] = useState("today");
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Fetch position history based on date range
  const fetchPositions = useCallback(async () => {
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date = endOfDay(new Date());

      switch (dateRange) {
        case "today":
          startDate = startOfDay(new Date());
          break;
        case "yesterday":
          startDate = startOfDay(subDays(new Date(), 1));
          endDate = endOfDay(subDays(new Date(), 1));
          break;
        case "last3days":
          startDate = startOfDay(subDays(new Date(), 3));
          break;
        case "last7days":
          startDate = startOfDay(subDays(new Date(), 7));
          break;
        default:
          startDate = startOfDay(new Date());
      }

      const { data, error } = await (supabase as any)
        .from("position_history")
        .select("id, latitude, longitude, speed, heading, gps_time, ignition_on")
        .eq("device_id", deviceId)
        .gte("gps_time", startDate.toISOString())
        .lte("gps_time", endDate.toISOString())
        .order("gps_time", { ascending: true });

      if (error) {
        console.error("Error fetching positions:", error);
        return;
      }

      // Filter out positions without valid coordinates
      const validPositions = ((data as any[]) || []).filter(
        (p: any): p is PositionPoint => 
          p.latitude !== null && 
          p.longitude !== null && 
          p.latitude !== 0 && 
          p.longitude !== 0
      );

      setPositions(validPositions);
      setCurrentIndex(0);
      setIsPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [deviceId, dateRange]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || positions.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      const interval = 500 / playbackSpeed; // Base interval of 500ms

      if (elapsed >= interval) {
        setCurrentIndex((prev) => {
          if (prev >= positions.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
        lastTimeRef.current = timestamp;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, positions.length, playbackSpeed]);

  // Calculate trip summary metrics
  const tripSummary = useMemo(() => {
    if (positions.length < 2) {
      return { distance: 0, avgSpeed: 0, stops: 0, duration: 0 };
    }

    let totalDistance = 0;
    let totalSpeed = 0;
    let speedCount = 0;
    let stops = 0;
    let wasMoving = false;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      // Calculate distance using Haversine formula
      if (i > 0) {
        const prev = positions[i - 1];
        const R = 6371; // Earth's radius in km
        const dLat = ((pos.latitude - prev.latitude) * Math.PI) / 180;
        const dLon = ((pos.longitude - prev.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((prev.latitude * Math.PI) / 180) *
            Math.cos((pos.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistance += R * c;
      }

      // Track speed for average
      if (pos.speed !== null && pos.speed !== undefined) {
        totalSpeed += pos.speed;
        speedCount++;
      }

      // Count stops (speed drops to 0 after moving)
      const isMoving = (pos.speed || 0) > 2; // Consider moving if speed > 2 km/h
      if (wasMoving && !isMoving) {
        stops++;
      }
      wasMoving = isMoving;
    }

    const startTime = new Date(positions[0].gps_time);
    const endTime = new Date(positions[positions.length - 1].gps_time);
    const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    return {
      distance: totalDistance,
      avgSpeed: speedCount > 0 ? totalSpeed / speedCount : 0,
      stops,
      duration: durationSeconds,
    };
  }, [positions]);

  // Format duration to human readable
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const currentPosition = positions[currentIndex];
  const traveledPath = positions.slice(0, currentIndex + 1);
  const remainingPath = positions.slice(currentIndex);

  const handleSliderChange = (value: number[]) => {
    setCurrentIndex(value[0]);
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (currentIndex >= positions.length - 1) {
      setCurrentIndex(0);
    }
    lastTimeRef.current = 0;
    setIsPlaying(!isPlaying);
  };

  const handleSkipBack = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const handleSkipForward = () => {
    setIsPlaying(false);
    setCurrentIndex(positions.length - 1);
  };

  const center: [number, number] = currentPosition 
    ? [currentPosition.latitude, currentPosition.longitude]
    : [0, 0];

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Trip Playback</CardTitle>
              <p className="text-sm text-muted-foreground">{deviceName}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range Selector */}
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last3days">Last 3 Days</SelectItem>
              <SelectItem value="last7days">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
          
          {positions.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {positions.length} points
            </Badge>
          )}
        </div>

        {/* Trip Summary Card */}
        {positions.length >= 2 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Route className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold">{tripSummary.distance.toFixed(1)} km</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="p-2 rounded-full bg-green-500/20">
                <Gauge className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Speed</p>
                <p className="text-sm font-semibold">{tripSummary.avgSpeed.toFixed(0)} km/h</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <div className="p-2 rounded-full bg-orange-500/20">
                <StopCircle className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stops</p>
                <p className="text-sm font-semibold">{tripSummary.stops}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Timer className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="text-sm font-semibold">{formatDuration(tripSummary.duration)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="rounded-lg border border-border overflow-hidden h-[350px]">
          {loading ? (
            <div className="h-full flex items-center justify-center bg-muted/50">
              <p className="text-muted-foreground">Loading trip data...</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No trip data available for this period</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={center}
              zoom={14}
              scrollWheelZoom={true}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds positions={positions} />
              
              {/* Traveled path (blue) */}
              {traveledPath.length > 1 && (
                <Polyline
                  positions={traveledPath.map(p => [p.latitude, p.longitude] as [number, number])}
                  color="#3b82f6"
                  weight={4}
                  opacity={0.8}
                />
              )}
              
              {/* Remaining path (gray) */}
              {remainingPath.length > 1 && (
                <Polyline
                  positions={remainingPath.map(p => [p.latitude, p.longitude] as [number, number])}
                  color="#94a3b8"
                  weight={3}
                  opacity={0.5}
                  dashArray="5, 10"
                />
              )}

              {/* Start marker */}
              {positions.length > 0 && (
                <Marker position={[positions[0].latitude, positions[0].longitude]}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold text-green-600">Start Point</p>
                      <p>{format(new Date(positions[0].gps_time), "PPpp")}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End marker */}
              {positions.length > 1 && (
                <Marker position={[positions[positions.length - 1].latitude, positions[positions.length - 1].longitude]}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold text-red-600">End Point</p>
                      <p>{formatLagos(new Date(positions[positions.length - 1].gps_time), "MMM d, yyyy HH:mm:ss")}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Current position marker with rotation */}
              {currentPosition && (
                <Marker 
                  position={[currentPosition.latitude, currentPosition.longitude]}
                  icon={createVehicleIcon(currentPosition.heading || 0)}
                >
                  <Popup>
                    <div className="text-sm space-y-1">
                      <p className="font-semibold">{deviceName}</p>
                      <p>Speed: {currentPosition.speed || 0} km/h</p>
                      <p>{format(new Date(currentPosition.gps_time), "PPpp")}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}
        </div>

        {/* Current Position Info */}
        {currentPosition && (
          <div className="flex items-center gap-6 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {format(new Date(currentPosition.gps_time), "PPpp")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {currentPosition.speed || 0} km/h
              </span>
            </div>
            <Badge variant={currentPosition.ignition_on ? "default" : "secondary"}>
              Ignition {currentPosition.ignition_on ? "ON" : "OFF"}
            </Badge>
          </div>
        )}

        {/* Timeline Slider */}
        {positions.length > 0 && (
          <div className="space-y-2">
            <Slider
              value={[currentIndex]}
              max={positions.length - 1}
              step={1}
              onValueChange={handleSliderChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{positions.length > 0 ? formatLagos(new Date(positions[0].gps_time), "HH:mm") : "--:--"}</span>
              <span>{currentIndex + 1} / {positions.length}</span>
              <span>{positions.length > 0 ? formatLagos(new Date(positions[positions.length - 1].gps_time), "HH:mm") : "--:--"}</span>
            </div>
          </div>
        )}

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleSkipBack}
            disabled={positions.length === 0}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button 
            size="lg"
            onClick={handlePlayPause}
            disabled={positions.length === 0}
            className="w-16 h-12"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={handleSkipForward}
            disabled={positions.length === 0}
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          {/* Speed Control */}
          <Select 
            value={playbackSpeed.toString()} 
            onValueChange={(v) => setPlaybackSpeed(parseFloat(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="4">4x</SelectItem>
              <SelectItem value="8">8x</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
