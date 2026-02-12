import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import { loadMapbox } from "@/utils/loadMapbox";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";

interface VehicleAvatarMapProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  className?: string;
}

export function VehicleAvatarMap({ latitude, longitude, className }: VehicleAvatarMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const { data: mapboxFlag } = useFeatureFlag("mapbox_enabled");
  const mapboxEnabled = mapboxFlag?.enabled ?? true;

  const hasValidCoordinates = useMemo(() => {
    return (
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      !isNaN(latitude) &&
      !isNaN(longitude) &&
      latitude !== 0 &&
      longitude !== 0
    );
  }, [latitude, longitude]);

  useEffect(() => {
    if (!mapboxEnabled || !hasValidCoordinates || !mapContainer.current || mapRef.current) return;

    const initMap = async () => {
      try {
        const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        if (!token) {
          setMapError("Missing Mapbox token");
          return;
        }

        setMapboxLoading(true);
        const mapboxgl = await loadMapbox();
        mapboxgl.accessToken = token;

        mapRef.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [longitude as number, latitude as number],
          zoom: 15,
          interactive: false,
          attributionControl: false,
        });

        mapRef.current.on("load", () => {
          markerRef.current = new mapboxgl.Marker({ color: "#f97316" })
            .setLngLat([longitude as number, latitude as number])
            .addTo(mapRef.current as MapboxMap);
        });
      } catch (error) {
        setMapError("Failed to load map");
        console.error("[VehicleAvatarMap] init failed:", error);
      } finally {
        setMapboxLoading(false);
      }
    };

    initMap();

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapboxEnabled, hasValidCoordinates]);

  useEffect(() => {
    if (!mapRef.current || !hasValidCoordinates) return;
    try {
      mapRef.current.setCenter([longitude as number, latitude as number]);
      if (markerRef.current) {
        markerRef.current.setLngLat([longitude as number, latitude as number]);
      }
    } catch (error) {
      console.error("[VehicleAvatarMap] update failed:", error);
    }
  }, [hasValidCoordinates, latitude, longitude]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-full", className)}>
      <div ref={mapContainer} className="absolute inset-0" />
      {!mapboxEnabled && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted">
          Map disabled
        </div>
      )}
      {mapboxLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted/70">
          Loading
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted">
          {mapError}
        </div>
      )}
      {!hasValidCoordinates && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground bg-muted">
          No GPS
        </div>
      )}
    </div>
  );
}
