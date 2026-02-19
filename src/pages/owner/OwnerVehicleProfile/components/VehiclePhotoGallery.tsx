import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Image, ChevronLeft, ChevronRight, Maximize2, Loader2 } from "lucide-react";

interface VehiclePhoto {
  id: string;
  device_id: string;
  url: string;
  sort_order: number | null;
  created_at: string;
}

interface VehiclePhotoGalleryProps {
  deviceId: string;
}

const friendlyGalleryError = (raw?: string | null) => {
  if (!raw) return "Vehicle photo gallery is temporarily unavailable.";
  const msg = raw.toLowerCase();
  if (msg.includes("vehicle_photos") && msg.includes("schema cache")) {
    return "Vehicle photo gallery is not yet configured. Please contact support if this persists.";
  }
  return "Failed to load vehicle photos. Please try again.";
};

export function VehiclePhotoGallery({ deviceId }: VehiclePhotoGalleryProps) {
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const loadPhotos = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any)
        .from("vehicle_photos")
        .select("id, device_id, url, sort_order, created_at")
        .eq("device_id", deviceId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      setPhotos((data as VehiclePhoto[]) || []);
      setActiveIndex(0);
    } catch (e: any) {
      const raw = e?.message || (typeof e === "string" ? e : undefined);
      setError(friendlyGalleryError(raw));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ deviceId?: string }>;
      if (!custom.detail || !custom.detail.deviceId) return;
      if (custom.detail.deviceId !== deviceId) return;
      loadPhotos();
    };
    window.addEventListener("vehicle-photos-updated", handler as EventListener);
    return () => window.removeEventListener("vehicle-photos-updated", handler as EventListener);
  }, [deviceId, loadPhotos]);

  const hasPhotos = photos.length > 0;
  const clampedIndex = hasPhotos ? Math.min(activeIndex, photos.length - 1) : 0;

  const goPrev = () => {
    if (!hasPhotos) return;
    setActiveIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
  };

  const goNext = () => {
    if (!hasPhotos) return;
    setActiveIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
  };

  const openZoomAt = (index: number) => {
    if (!hasPhotos) return;
    setZoomIndex(index);
    setZoomOpen(true);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!hasPhotos) return;
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchDeltaX.current = 0;
    setSwiping(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!hasPhotos) return;
    if (touchStartX.current == null) return;
    const touch = event.touches[0];
    touchDeltaX.current = touch.clientX - touchStartX.current;
  };

  const handleTouchEnd = () => {
    if (!hasPhotos) {
      setSwiping(false);
      return;
    }
    const threshold = 48;
    if (touchDeltaX.current > threshold) {
      goPrev();
    } else if (touchDeltaX.current < -threshold) {
      goNext();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setSwiping(false);
  };

  if (!deviceId) return null;

  return (
    <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Image className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Vehicle photos</p>
              <p className="text-[11px] text-muted-foreground">
                Showcase this vehicle with a rich photo gallery
              </p>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading</span>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            {error}
          </div>
        )}

        {loading && !hasPhotos && (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {!loading && !hasPhotos && !error && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 px-4 py-6 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No photos yet</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Add vehicle photos from the settings panel to create a rich, social-style gallery.
            </p>
          </div>
        )}

        {hasPhotos && (
          <div className="space-y-3">
            <div
              className="relative overflow-hidden rounded-2xl bg-muted/40 shadow-neumorphic-sm group"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className={cn(
                  "flex transition-transform duration-500 ease-out",
                  swiping && "duration-0"
                )}
                style={{ transform: `translateX(-${clampedIndex * 100}%)` }}
              >
                {photos.map((photo) => (
                  <div key={photo.id} className="min-w-full aspect-[4/3] bg-muted/60 flex items-center justify-center">
                    <button
                      type="button"
                      className="w-full h-full focus:outline-none"
                      onClick={() => openZoomAt(photos.indexOf(photo))}
                    >
                      <img
                        src={photo.url}
                        alt="Vehicle photo"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  </div>
                ))}
              </div>

              {photos.length > 1 && (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10 opacity-80" />
                  <div className="absolute inset-0 flex items-center justify-between px-2 md:px-3">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 pointer-events-auto"
                      onClick={goPrev}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60 pointer-events-auto"
                      onClick={goNext}
                      aria-label="Next photo"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="absolute bottom-2 left-0 right-0 flex items-center justify-between px-3 text-[11px] text-white/90 pointer-events-none">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5">
                      <Image className="h-3 w-3" />
                      <span>
                        {clampedIndex + 1} / {photos.length}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5">
                      Tap to zoom
                    </span>
                  </div>
                </>
              )}

              {photos.length === 1 && (
                <div className="absolute bottom-2 right-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white/90">
                    <Image className="h-3 w-3" />
                    Featured photo
                  </span>
                </div>
              )}
            </div>

            {photos.length > 1 && (
              <div className="hidden md:grid grid-cols-4 gap-2">
                {photos.slice(0, 4).map((photo, index) => {
                  const isActive = index === clampedIndex;
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={cn(
                        "relative h-16 rounded-xl overflow-hidden border border-transparent bg-muted/40 transition-all duration-200",
                        "hover:border-accent/70 hover:shadow-neumorphic-sm",
                        isActive && "border-accent shadow-neumorphic-sm"
                      )}
                    >
                      <img
                        src={photo.url}
                        alt="Vehicle thumbnail"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      {isActive && (
                        <div className="absolute inset-0 bg-black/20" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {photos.length > 1 && (
              <div className="md:hidden flex items-center justify-center gap-1">
                {photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-200",
                      clampedIndex === index ? "w-4 bg-foreground" : "w-1.5 bg-muted-foreground/40"
                    )}
                    aria-label={`Go to photo ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {hasPhotos && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Photos managed from Settings. Upload, reorder, or delete from the gallery manager.
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full border border-border/60 hover:bg-secondary/60"
              onClick={() => openZoomAt(clampedIndex)}
              aria-label="Open fullscreen gallery"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="max-w-3xl w-[96vw] bg-background/95 p-0 overflow-hidden">
            {hasPhotos && (
              <div className="relative bg-black">
                <div className="flex items-center justify-between px-3 py-2 bg-black/70 text-[11px] text-white/90">
                  <span>
                    Photo {zoomIndex + 1} of {photos.length}
                  </span>
                </div>
                <div className="relative flex items-center justify-center bg-black">
                  <img
                    src={photos[zoomIndex].url}
                    alt="Vehicle zoomed"
                    className="max-h-[70vh] w-full object-contain"
                  />
                  {photos.length > 1 && (
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80"
                        onClick={() =>
                          setZoomIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1))
                        }
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80"
                        onClick={() =>
                          setZoomIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1))
                        }
                        aria-label="Next photo"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
