import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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
import { format, endOfDay, startOfDay, subDays } from "date-fns";
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
  StopCircle,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  FileText,
  History,
  Loader2
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as DayPickerCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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

interface TimelineEvent {
  index: number;
  label: string;
  time: string;
  type: "stop" | "ignition_on" | "ignition_off";
}

interface SessionItem {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string;
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
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [dateRange, setDateRange] = useState("today");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [showSessions, setShowSessions] = useState(false);
  const [filterText, setFilterText] = useState("");
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        case "custom":
          startDate = customDateRange.from ? startOfDay(customDateRange.from) : startOfDay(new Date());
          endDate = customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(startDate);
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
        setError("Unable to load trip data. Please try again.");
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
  }, [deviceId, dateRange, customDateRange.from, customDateRange.to]);

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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    if (positions.length < 2) {
      return [];
    }
    const events: TimelineEvent[] = [];
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      const prevSpeed = prev.speed || 0;
      const currSpeed = curr.speed || 0;
      if (prevSpeed > 5 && currSpeed <= 2) {
        events.push({
          index: i,
          label: "Stop",
          time: curr.gps_time,
          type: "stop",
        });
      }
      if (prev.ignition_on !== curr.ignition_on) {
        events.push({
          index: i,
          label: curr.ignition_on ? "Ignition on" : "Ignition off",
          time: curr.gps_time,
          type: curr.ignition_on ? "ignition_on" : "ignition_off",
        });
      }
    }
    return events.slice(0, 25);
  }, [positions]);

  const sessions: SessionItem[] = useMemo(() => {
    if (positions.length === 0) {
      return [];
    }
    const first = positions[0];
    const last = positions[positions.length - 1];
    return [
      {
        id: "current",
        title: "Current selection",
        startTime: first.gps_time,
        endTime: last.gps_time,
        description: "Playback for the selected date range",
      },
    ];
  }, [positions]);

  const filteredSessions = useMemo(() => {
    if (!filterText.trim()) {
      return sessions;
    }
    const query = filterText.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query),
    );
  }, [sessions, filterText]);

  const currentPosition = positions[currentIndex];
  const traveledPath = useMemo(
    () => positions.slice(0, currentIndex + 1),
    [positions, currentIndex],
  );
  const remainingPath = useMemo(
    () => positions.slice(currentIndex),
    [positions, currentIndex],
  );

  const hasPositions = positions.length > 0;
  const isPlayButtonDisabled = !hasPositions || loading;

  const status = loading
    ? "loading"
    : !hasPositions
      ? "idle"
      : isPlaying
        ? "playing"
        : "paused";

  const statusText =
    status === "loading"
      ? "Loading…"
      : status === "playing"
        ? "Playing"
        : status === "paused"
          ? "Paused"
          : "No data";

  const statusClass =
    status === "loading"
      ? "text-xs font-medium text-primary transition-colors"
      : status === "playing"
        ? "text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors"
        : status === "paused"
          ? "text-xs font-medium text-amber-600 dark:text-amber-400 transition-colors"
          : "text-xs font-medium text-muted-foreground transition-colors";

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (!(event.code === "Space" || event.key === " ")) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tagName = target.tagName;
    const isEditable =
      target.isContentEditable ||
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT";

    if (isEditable) return;

    event.preventDefault();
    if (isPlayButtonDisabled) return;
    handlePlayPause();
  };

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
    <Card className="border-border bg-card" onKeyDown={handleKeyDown}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">History playback</CardTitle>
              <p className="text-sm text-muted-foreground">{deviceName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSessions((prev) => !prev)}
              aria-pressed={showSessions}
              aria-label={showSessions ? "Hide session list" : "Show session list"}
            >
              {showSessions ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open export options">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {}}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>Download CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <Share2 className="mr-2 h-4 w-4" />
                  <span>Copy share link</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Generate report</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close playback">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[180px]" aria-label="Select date range preset">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last3days">Last 3 Days</SelectItem>
                  <SelectItem value="last7days">Last 7 Days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      (!customDateRange.from || !customDateRange.to) && "text-muted-foreground",
                    )}
                    aria-label="Choose custom date range"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {customDateRange.from && customDateRange.to ? (
                      <>
                        {format(customDateRange.from, "PPP")} – {format(customDateRange.to, "PPP")}
                      </>
                    ) : (
                      <span>Select date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DayPickerCalendar
                    mode="range"
                    selected={customDateRange}
                    onSelect={(range) =>
                      setCustomDateRange({
                        from: range?.from,
                        to: range?.to,
                      })
                    }
                    numberOfMonths={1}
                    disabled={(date) => date > new Date()}
                  />
                </PopoverContent>
              </Popover>
              {positions.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {positions.length} points
                </Badge>
              )}
            </div>
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
                  {traveledPath.length > 1 && (
                    <Polyline
                      positions={traveledPath.map(p => [p.latitude, p.longitude] as [number, number])}
                      color="#3b82f6"
                      weight={4}
                      opacity={0.8}
                    />
                  )}
                  {remainingPath.length > 1 && (
                    <Polyline
                      positions={remainingPath.map(p => [p.latitude, p.longitude] as [number, number])}
                      color="#94a3b8"
                      weight={3}
                      opacity={0.5}
                      dashArray="5, 10"
                    />
                  )}
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
            {positions.length > 0 && (
              <div className="space-y-3">
                <Slider
                  value={[currentIndex]}
                  max={positions.length - 1}
                  step={1}
                  onValueChange={handleSliderChange}
                  className="w-full"
                  aria-label="Playback timeline"
                />
                {timelineEvents.length > 0 && (
                  <div className="relative h-6">
                    <div className="absolute inset-y-2 left-0 right-0 border-t border-border" />
                    {timelineEvents.map((event) => {
                      const ratio =
                        positions.length > 1 ? event.index / (positions.length - 1) : 0;
                      const left = `${ratio * 100}%`;
                      const color =
                        event.type === "stop"
                          ? "bg-orange-500"
                          : event.type === "ignition_on"
                          ? "bg-green-500"
                          : "bg-red-500";
                      return (
                        <button
                          key={`${event.type}-${event.index}-${event.time}`}
                          type="button"
                          className="absolute -translate-x-1/2 -top-1 focus:outline-none"
                          style={{ left }}
                          onClick={() => {
                            setCurrentIndex(event.index);
                            setIsPlaying(false);
                          }}
                          aria-label={`${event.label} at ${formatLagos(new Date(event.time), "PPpp")}`}
                        >
                          <span
                            className={cn(
                              "w-2.5 h-2.5 rounded-full border border-background",
                              color,
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {positions.length > 0
                      ? formatLagos(new Date(positions[0].gps_time), "HH:mm")
                      : "--:--"}
                  </span>
                  <span>
                    {currentIndex + 1} / {positions.length}
                  </span>
                  <span>
                    {positions.length > 0
                      ? formatLagos(
                          new Date(positions[positions.length - 1].gps_time),
                          "HH:mm",
                        )
                      : "--:--"}
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col items-center gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleSkipBack}
                  disabled={isPlayButtonDisabled}
                  aria-label="Skip to start"
                  aria-disabled={isPlayButtonDisabled}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button 
                  size="lg"
                  onClick={handlePlayPause}
                  disabled={isPlayButtonDisabled}
                  className="w-16 h-12"
                  aria-label={
                    isPlayButtonDisabled
                      ? "Playback not available"
                      : isPlaying
                        ? "Pause playback"
                        : "Play playback"
                  }
                  aria-pressed={!isPlayButtonDisabled ? isPlaying : undefined}
                  aria-busy={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleSkipForward}
                  disabled={isPlayButtonDisabled}
                  aria-label="Skip to end"
                  aria-disabled={isPlayButtonDisabled}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Speed</span>
                  <Select 
                    value={playbackSpeed.toString()} 
                    onValueChange={(v) => setPlaybackSpeed(parseFloat(v))}
                  >
                    <SelectTrigger className="w-[100px]" aria-label="Playback speed">
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
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[volume * 100]}
                    max={100}
                    step={1}
                    onValueChange={(val) => setVolume((val[0] || 0) / 100)}
                    className="w-28"
                    aria-label="Playback volume"
                  />
                </div>
                <div className={statusClass} aria-live="polite">
                  {statusText}
                </div>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "w-full lg:w-72 border border-border rounded-lg bg-muted/40 flex flex-col",
              showSessions ? "flex" : "hidden lg:flex",
            )}
            aria-label="Historical sessions"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Sessions</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSessions((prev) => !prev)}
                aria-label={showSessions ? "Collapse sessions panel" : "Expand sessions panel"}
              >
                {showSessions ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="p-3 space-y-3 flex-1 overflow-auto">
              <Input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter sessions"
                className="h-8 text-xs"
                aria-label="Filter sessions"
              />
              {filteredSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions for this selection.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredSessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex items-center gap-3 p-2 rounded-md bg-card border border-border/60"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                        <Navigation className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium">{session.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatLagos(new Date(session.startTime), "PPpp")} –{" "}
                          {formatLagos(new Date(session.endTime), "PPpp")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {session.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
