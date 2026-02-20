import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Pause, X, Zap } from "lucide-react";
import type { VehicleTrip } from "@/hooks/useVehicleProfile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { splitRouteIntoSegments } from "../../../../utils/trip-transform";
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

export function TripPlaybackModal({ open, deviceId, trip, onClose }: TripPlaybackModalProps) {
  const [samples, setSamples] = useState<PositionSample[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);

  const speedOptions = [1, 2, 4] as const;
  const playbackSpeed = speedOptions[speedIndex];

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open && animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      lastTimeRef.current = null;
    }
  }, [open]);

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
        const cast = ((data ?? []) as unknown) as PositionSample[];
        setSamples(cast);
        if (cast.length > 0) {
          setCurrentIndex(0);
          setIsPlaying(true);
        } else {
          setIsPlaying(false);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load route");
        setIsPlaying(false);
      } finally {
        setLoading(false);
      }
    };
    fetchRoute();
  }, [open, deviceId, trip.start_time, trip.end_time]);

  const routeCoords = useMemo(() => {
    if (!samples || samples.length === 0) return [];
    return samples.map(s => ({ lat: s.latitude, lon: s.longitude }));
  }, [samples]);

  const routeStartEnd = useMemo(() => {
    if (!samples || samples.length === 0) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    return { start: { lat: first.latitude, lon: first.longitude }, end: { lat: last.latitude, lon: last.longitude } };
  }, [samples]);

  const hasRoute = routeCoords.length > 0;

  const clampedIndex = useMemo(() => {
    if (!hasRoute) return 0;
    if (currentIndex >= routeCoords.length) {
      return routeCoords.length - 1;
    }
    if (currentIndex < 0) return 0;
    return currentIndex;
  }, [hasRoute, currentIndex, routeCoords.length]);

  const currentPoint = hasRoute ? routeCoords[clampedIndex] : null;

  const activeLat = currentPoint?.lat ?? routeStartEnd?.start.lat ?? trip.start_latitude ?? null;
  const activeLon = currentPoint?.lon ?? routeStartEnd?.start.lon ?? trip.start_longitude ?? null;

  useEffect(() => {
    if (!isPlaying || !hasRoute) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const stepInterval = 300 / playbackSpeed;

    const animate = (timestamp: number) => {
      if (lastTimeRef.current == null) {
        lastTimeRef.current = timestamp;
      }
      const elapsed = timestamp - lastTimeRef.current;
      if (elapsed >= stepInterval) {
        setCurrentIndex(prev => {
          if (prev >= routeCoords.length - 1) {
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
        animationRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, hasRoute, routeCoords.length]);

  const handleTogglePlay = () => {
    if (!hasRoute || loading) return;
    setIsPlaying(prev => !prev);
  };

  const handleCycleSpeed = () => {
    setSpeedIndex(prev => (prev + 1) % speedOptions.length);
  };

  const handleClose = () => {
    setIsPlaying(false);
    onClose();
  };

  const isPlayDisabled = !hasRoute || loading;
  const playLabel = isPlaying ? "Pause" : "Play";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className={cn(
          "p-0 w-screen h-screen max-w-[100vw] max-h-[100vh] bg-background sm:rounded-none flex flex-col"
        )}
      >
        <DialogTitle className="sr-only">
          Trip playback for selected vehicle
        </DialogTitle>
        <DialogDescription className="sr-only">
          Full-screen map showing the vehicle&apos;s route with playback controls.
        </DialogDescription>
        <div className="flex-1 relative bg-black">
          <VehicleLocationMap
            latitude={activeLat}
            longitude={activeLon}
            showAddressCard={false}
            mapHeight="h-full"
            routeCoords={routeCoords}
            routeStartEnd={routeStartEnd ?? undefined}
            controlsInset={true}
            forceMapbox={true}
            allowEmptyMap={true}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-card/90 border border-border/60">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-foreground">Loading trip route…</span>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border bg-card/95 backdrop-blur-md px-3 py-2 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close playback"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant={isPlaying ? "default" : "outline"}
              size="sm"
              onClick={handleTogglePlay}
              disabled={isPlayDisabled}
              className="flex items-center gap-2"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span className="text-sm">{playLabel}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCycleSpeed}
              disabled={!hasRoute}
              className="flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              <span className="text-sm">{playbackSpeed}x</span>
            </Button>
          </div>
          {error && (
            <div className="ml-2 flex-1 text-right text-[11px] text-destructive truncate">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getSegmentRouteCoordsForTest(segments: ReturnType<typeof splitRouteIntoSegments>, index: number) {
  const seg = segments[index];
  return seg ? seg.coords.map(c => ({ lat: c.lat, lon: c.lon })) : [];
}
