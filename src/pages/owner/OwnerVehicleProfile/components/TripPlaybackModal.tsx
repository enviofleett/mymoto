import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Maximize2, Minimize2, MapPin, Route, Gauge, Clock, PauseCircle } from "lucide-react";
import type { VehicleTrip } from "@/hooks/useVehicleProfile";
import { formatLagos } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { splitRouteIntoSegments, computeTripSummary } from "../../../../utils/trip-transform";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";

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
  const avgSpeedKmh = hasComputedSummary ? summary.avgSpeedKmh : (trip.avg_speed ?? 0);

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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden w-[calc(100vw-1rem)] max-w-none h-[92dvh] max-h-[96dvh] sm:h-auto sm:max-h-[90dvh]",
          maximized ? "sm:w-[95vw] sm:h-[90vh]" : "sm:max-w-[900px]"
        )}
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
                  latitude={baseLat}
                  longitude={baseLon}
                  showAddressCard={false}
                  mapHeight={maximized ? "h-full min-h-[320px]" : "h-[42dvh] min-h-[280px] max-h-[420px]"}
                  routeCoords={selectedCoords ?? routeCoords}
                  routeStartEnd={selectedCoords ? {
                    start: selectedSegment!.start,
                    end: selectedSegment!.end,
                  } : routeStartEnd}
                />
              </CardContent>
            </Card>
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
              <Card className="bg-muted/40 border-border/80">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><Gauge className="h-3 w-3" />Avg Speed</div>
                  <div className="text-lg font-semibold">{Math.round(avgSpeedKmh)} km/h</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/40 border-border/80">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><PauseCircle className="h-3 w-3" />Stops</div>
                  <div className="text-lg font-semibold">{summary.stopCount}</div>
                </CardContent>
              </Card>
              <Card className="bg-muted/40 border-border/80">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-2"><PauseCircle className="h-3 w-3" />Longest Idle</div>
                  <div className="text-lg font-semibold">{Math.round(summary.longestIdleMin)} min</div>
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
                      className={cn(
                        "w-full text-left px-3 py-2 border-b hover:bg-muted/40 transition-colors",
                        selectedIndex === i && "bg-muted/60"
                      )}
                      onClick={() => setSelectedIndex(i)}
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
