import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Maximize2, Minimize2, MapPin, Route, Clock, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { VehicleTrip } from "@/hooks/useVehicleProfile";
import { formatLagos } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { splitRouteIntoSegments, computeTripSummary } from "../../../../utils/trip-transform";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PositionSample = {
  latitude: number;
  longitude: number;
  gps_time: string;
  speed?: number | null;
  speed_kmh?: number | null;
};

interface TripPlaybackModalProps {
  open: boolean;
  deviceId: string;
  trip: VehicleTrip;
  onClose: () => void;
}

function getLegLabel(startTime: string, index: number, total: number, idleMinutes: number): string {
  const hour = new Date(startTime).getHours();
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (!isFirst && idleMinutes >= 15) return "Stopover leg";
  if (isLast && total > 1) return "Return leg";

  if (hour >= 5 && hour < 12) return "Morning drive";
  if (hour >= 12 && hour < 17) return "Afternoon drive";
  if (hour >= 17 && hour < 22) return "Evening drive";
  return "Late-night drive";
}

export function TripPlaybackModal({ open, deviceId, trip, onClose }: TripPlaybackModalProps) {
  const [samples, setSamples] = useState<PositionSample[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (open) {
      setSelectedIndex(null);
    }
  }, [open, trip.id]);

  useEffect(() => {
    if (!open) return;
    const fetchRoute = async () => {
      setLoading(true);
      setError(null);
      try {
        const from = trip.start_time;
        const to = trip.end_time ?? trip.start_time;
        const { data, error } = await (supabase as any)
          .from("position_history")
          .select("latitude, longitude, gps_time, speed")
          .eq("device_id", deviceId)
          .gte("gps_time", from)
          .lte("gps_time", to)
          .order("gps_time", { ascending: true })
          .limit(5000);
        if (error) throw error;
        setSamples(((data ?? []) as unknown) as PositionSample[]);
      } catch (e: any) {
        setError(e?.message || "Failed to load route");
      } finally {
        setLoading(false);
      }
    };
    fetchRoute();
  }, [open, deviceId, trip.start_time, trip.end_time]);

  const segments = useMemo(() => {
    return splitRouteIntoSegments(samples ?? []);
  }, [samples]);

  const summary = useMemo(() => computeTripSummary(segments), [segments]);
  const hasComputedSummary = segments.length > 0;
  const totalDistanceKm = hasComputedSummary ? summary.totalDistanceKm : (trip.distance_km ?? 0);
  const totalDurationMin = hasComputedSummary
    ? summary.totalDurationMin
    : typeof trip.duration_seconds === "number"
      ? trip.duration_seconds / 60
      : 0;
  const routeCoords = useMemo(() => {
    if (!samples || samples.length === 0) return [];
    return samples.map(s => ({ lat: s.latitude, lon: s.longitude }));
  }, [samples]);

  const selectedCoords = useMemo(() => {
    if (selectedIndex == null || !segments[selectedIndex]) return null;
    return segments[selectedIndex].coords.map(c => ({ lat: c.lat, lon: c.lon }));
  }, [segments, selectedIndex]);

  const selectedSegment = selectedIndex != null ? segments[selectedIndex] : null;
  const hasSamples = (samples?.length ?? 0) > 0;

  const selectedLegLabel = selectedSegment
    ? getLegLabel(selectedSegment.startTime, selectedIndex ?? 0, segments.length, selectedSegment.idleMinutes)
    : null;

  const routeStartEnd = useMemo(() => {
    if (!samples || samples.length === 0) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    return { start: { lat: first.latitude, lon: first.longitude }, end: { lat: last.latitude, lon: last.longitude } };
  }, [samples]);

  const playbackCoords = useMemo(() => {
    if (selectedCoords && selectedCoords.length > 0) return selectedCoords;
    return routeCoords;
  }, [selectedCoords, routeCoords]);

  const hasPlaybackPath = playbackCoords.length > 1;

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
    lastTimeRef.current = 0;
  }, [playbackCoords]);

  useEffect(() => {
    if (!isPlaying || !hasPlaybackPath) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const pathLength = playbackCoords.length;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      const interval = 500 / playbackSpeed;

      if (elapsed >= interval) {
        setCurrentIndex(prev => {
          if (prev >= pathLength - 1) {
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
  }, [isPlaying, hasPlaybackPath, playbackCoords, playbackSpeed]);

  const clampedIndex = playbackCoords.length > 0 ? Math.min(currentIndex, playbackCoords.length - 1) : 0;

  const currentPlaybackCoord = useMemo(() => {
    if (!hasPlaybackPath) return null;
    return playbackCoords[clampedIndex] ?? null;
  }, [hasPlaybackPath, playbackCoords, clampedIndex]);

  const playbackStartTime = selectedSegment ? selectedSegment.startTime : trip.start_time;
  const playbackEndTime = selectedSegment ? selectedSegment.endTime : (trip.end_time ?? trip.start_time);

  const handleSliderChange = (value: number[]) => {
    setCurrentIndex(value[0]);
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (!hasPlaybackPath || !hasSamples) return;
    if (currentIndex >= playbackCoords.length - 1) {
      setCurrentIndex(0);
    }
    lastTimeRef.current = 0;
    setIsPlaying(prev => !prev);
  };

  const handleSkipBack = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const handleSkipForward = () => {
    if (!hasPlaybackPath) return;
    setIsPlaying(false);
    setCurrentIndex(playbackCoords.length - 1);
  };

  const hasRoutePath = playbackCoords.length > 0;
  const isPlayButtonDisabled = !hasRoutePath || loading || !hasSamples;

  const status = loading
    ? "loading"
    : !hasRoutePath || !hasSamples
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

  const baseLat = useMemo(() => {
    if (selectedCoords && selectedCoords.length > 0) return selectedCoords[0].lat;
    if (routeStartEnd) return routeStartEnd.start.lat;
    return trip.start_latitude ?? null;
  }, [selectedCoords, routeStartEnd, trip.start_latitude]);

  const baseLon = useMemo(() => {
    if (selectedCoords && selectedCoords.length > 0) return selectedCoords[0].lon;
    if (routeStartEnd) return routeStartEnd.start.lon;
    return trip.start_longitude ?? null;
  }, [selectedCoords, routeStartEnd, trip.start_longitude]);

  const activeLat = currentPlaybackCoord ? currentPlaybackCoord.lat : baseLat;
  const activeLon = currentPlaybackCoord ? currentPlaybackCoord.lon : baseLon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden w-[calc(100vw-1rem)] max-w-none h-[92dvh] max-h-[96dvh] sm:h-auto sm:max-h-[90dvh]",
          maximized ? "sm:w-[95vw] sm:h-[90vh]" : "sm:max-w-[900px]"
        )}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              Trip Playback
              <Badge variant="outline" className="ml-2">
                {formatLagos(new Date(trip.start_time), "MMM d, HH:mm")}
                {trip.end_time ? ` – ${formatLagos(new Date(trip.end_time), "HH:mm")}` : ""}
              </Badge>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMaximized(m => !m)} aria-label="Toggle size">
                {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        </DialogHeader>

        <div
          className={cn(
            "grid gap-4 p-4 grid-cols-12 overflow-hidden h-[calc(92dvh-64px)] sm:h-auto",
            maximized && "sm:h-[calc(90vh-64px)]"
          )}
        >
          <div className={cn("col-span-12 md:col-span-7 order-1 md:order-none", maximized && "h-full")}>
            <Card className="h-full min-h-[280px] bg-card/50 border-border">
              <CardContent className="p-0 h-full min-h-[280px] relative">
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <div className="px-3 py-2 rounded-full bg-card/80 backdrop-blur-md shadow-neumorphic-sm flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs text-foreground">Loading route…</span>
                    </div>
                  </div>
                )}
                <VehicleLocationMap
                  latitude={activeLat}
                  longitude={activeLon}
                  showAddressCard={false}
                  mapHeight={maximized ? "h-full min-h-[320px]" : "h-[42dvh] min-h-[280px] max-h-[420px]"}
                  routeCoords={playbackCoords}
                  routeStartEnd={selectedSegment ? {
                    start: selectedSegment.start,
                    end: selectedSegment.end,
                  } : routeStartEnd}
                />
              </CardContent>
            </Card>
            {hasPlaybackPath && (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Slider
                    value={[clampedIndex]}
                    max={playbackCoords.length - 1}
                    step={1}
                    onValueChange={handleSliderChange}
                    className="w-full"
                    aria-label="Playback position"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatLagos(new Date(playbackStartTime), "HH:mm")}</span>
                    <span>{clampedIndex + 1} / {playbackCoords.length}</span>
                    <span>{formatLagos(new Date(playbackEndTime), "HH:mm")}</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 sm:gap-3">
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleSkipBack}
                      disabled={isPlayButtonDisabled}
                      aria-label="Skip to trip start"
                      aria-disabled={isPlayButtonDisabled}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      size="lg"
                      onClick={handlePlayPause}
                      disabled={isPlayButtonDisabled}
                      className="w-16 h-12"
                      aria-label={isPlayButtonDisabled ? "Playback not available" : isPlaying ? "Pause playback" : "Play trip"}
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
                      aria-label="Skip to trip end"
                      aria-disabled={isPlayButtonDisabled}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
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
                  <div className={statusClass} aria-live="polite">
                    {statusText}
                  </div>
                  {hasRoutePath && !loading && (
                    <div className="text-[11px] text-muted-foreground">
                      Press Space to play or pause playback
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              "col-span-12 md:col-span-5 space-y-3 order-2 md:order-none overflow-y-auto",
              maximized ? "h-full" : "max-h-[42vh] md:max-h-none"
            )}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Card className="bg-muted/40 border-border/80">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><Route className="h-3 w-3" />Total Distance</div>
                  <div className="text-lg font-semibold">{totalDistanceKm.toFixed(2)} km</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/40 border-border/80">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><Clock className="h-3 w-3" />Total Duration</div>
                  <div className="text-lg font-semibold">{Math.max(1, Math.round(totalDurationMin))} min</div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card/50 border-border">
              <CardContent className="p-0">
                <div className="p-3 border-b text-xs font-medium text-muted-foreground uppercase flex items-center justify-between gap-2">
                  <span>{selectedSegment ? "Focused Leg" : "Trip Legs"}</span>
                  {selectedSegment && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setSelectedIndex(null)}
                    >
                      Show Full Trip
                    </Button>
                  )}
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  {error && (
                    <div className="p-4 text-sm text-destructive">{error}</div>
                  )}
                  {!error && !loading && !hasSamples && (
                    <div className="p-4 text-sm text-muted-foreground">
                      No GPS history was found for this trip window.
                    </div>
                  )}
                  {!error && hasSamples && segments.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">No movement detected</div>
                  )}
                  {segments.map((seg, i) => (
                    <button
                      key={i}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 border-b hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        selectedIndex === i && "bg-muted/60"
                      )}
                      onClick={() => setSelectedIndex(i)}
                      aria-pressed={selectedIndex === i}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {getLegLabel(seg.startTime, i, segments.length, seg.idleMinutes)}
                          </span>
                          <span>·</span>
                          <span>{formatLagos(new Date(seg.startTime), "HH:mm")} – {formatLagos(new Date(seg.endTime), "HH:mm")}</span>
                        </div>
                        <div className="text-xs flex items-center gap-2">
                          <Badge variant="outline">{seg.distanceKm.toFixed(2)} km</Badge>
                          <Badge variant="outline">{Math.round(seg.avgSpeedKmh)} km/h</Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Duration: {Math.max(1, Math.round(seg.durationMin))} min · Max speed: {Math.round(seg.maxSpeedKmh)} km/h · Idle: {Math.round(seg.idleMinutes)} min
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedSegment && (
              <div className="text-xs p-2 rounded-md bg-muted/40 border">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-primary" />
                  Focused on {selectedLegLabel} (Leg {selectedIndex! + 1}).
                </div>
                <div className="mt-1">
                  {formatLagos(new Date(selectedSegment.startTime), "HH:mm")} – {formatLagos(new Date(selectedSegment.endTime), "HH:mm")} · {selectedSegment.distanceKm.toFixed(2)} km · Avg {Math.round(selectedSegment.avgSpeedKmh)} km/h
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getSegmentRouteCoordsForTest(segments: ReturnType<typeof splitRouteIntoSegments>, index: number) {
  const seg = segments[index];
  return seg ? seg.coords.map(c => ({ lat: c.lat, lon: c.lon })) : [];
}
