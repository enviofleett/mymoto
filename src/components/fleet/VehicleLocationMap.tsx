import { useEffect, useRef, useState, useMemo } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { loadMapbox } from "@/utils/loadMapbox";
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { MapPin, Navigation, ExternalLink, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { LeafletVehicleMap } from "@/components/maps/LeafletVehicleMap";

interface VehicleLocationMapProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  heading?: number | null;
  speed?: number | null;
  address?: string | null;
  vehicleName?: string;
  isOnline?: boolean;
  className?: string;
  showAddressCard?: boolean;
  mapHeight?: string;
  routeCoords?: Array<{ lat: number; lon: number }>;
  routeStartEnd?: { start: { lat: number; lon: number }, end: { lat: number; lon: number } } | undefined;
  geofences?: Array<{ latitude: number; longitude: number; radius: number; name?: string }>;
}

// Constants
const SPEED_THRESHOLD = 3; // km/h - below this is parked
const MAP_ZOOM = 16;
const MAP_PITCH = 45;
const MAP_ANIMATION_DURATION = 1000;

// Vehicle status type
type VehicleStatus = 'parked' | 'moving' | 'offline';

// Determine vehicle status
function getVehicleStatus(isOnline: boolean, speed: number): VehicleStatus {
  if (!isOnline) return 'offline';
  return speed >= SPEED_THRESHOLD ? 'moving' : 'parked';
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    return !!gl2;
  } catch {
    return false;
  }
}

// Create marker HTML (always orange dot)
function createMarkerHTML(status: VehicleStatus, heading: number, speed: number): string {
  void status;
  void heading;
  void speed;

  return `
    <div class="car-marker-container">
      <div class="car-pulse orange"></div>
      <div class="car-icon orange">
        <div class="status-dot"></div>
      </div>
    </div>
  `;
}

export function VehicleLocationMap({
  latitude,
  longitude,
  heading = 0,
  speed = 0,
  address,
  vehicleName,
  isOnline = true,
  className,
  showAddressCard = true,
  mapHeight = 'h-64',
  routeCoords,
  routeStartEnd,
  geofences,
}: VehicleLocationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const marker = useRef<MapboxMarker | null>(null);
  const markerElement = useRef<HTMLDivElement | null>(null);
  const mapboxRef = useRef<any>(null);
  const lastCameraMoveAtRef = useRef<number>(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const { data: mapboxFlag } = useFeatureFlag("mapbox_enabled");
  const mapboxEnabled = mapboxFlag?.enabled ?? true;
  const [renderMode, setRenderMode] = useState<"mapbox" | "leaflet">("mapbox");

  // Validate coordinates
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

  // Determine vehicle status
  const vehicleStatus = useMemo<VehicleStatus>(() => {
    return getVehicleStatus(isOnline, speed || 0);
  }, [isOnline, speed]);

  const hasRoute = useMemo(() => {
    return (routeCoords && routeCoords.length > 1) || !!routeStartEnd;
  }, [routeCoords, routeStartEnd]);

  // Google Maps link
  const googleMapsLink = useMemo(() => {
    return hasValidCoordinates
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : '#';
  }, [hasValidCoordinates, latitude, longitude]);

  // Decide initial render mode (Mapbox when viable, Leaflet otherwise).
  useEffect(() => {
    if (!mapboxEnabled) return;
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setRenderMode("leaflet");
      return;
    }
    if (typeof window !== "undefined" && !supportsWebGL2()) {
      setRenderMode("leaflet");
      return;
    }
    setRenderMode("mapbox");
  }, [mapboxEnabled]);

  // Warm the mapbox chunk early so the UI doesn't feel "stuck" waiting on it.
  useEffect(() => {
    if (!mapboxEnabled) return;
    if (renderMode !== "mapbox") return;
    if (mapboxRef.current) return;
    void loadMapbox()
      .then((m) => {
        mapboxRef.current = m;
      })
      .catch(() => {
        // ignore; init effect will surface a user-facing error if needed
      });
  }, [mapboxEnabled, renderMode]);

  // Initialize map once
  useEffect(() => {
    if (!mapboxEnabled) return;
    if (renderMode !== "mapbox") return;
    if (!mapContainer.current || (!hasValidCoordinates && !hasRoute) || map.current) return;

    const initMap = async () => {
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      if (!token) {
        // Token missing: render Leaflet fallback.
        setRenderMode("leaflet");
        return;
      }

      try {
        setMapboxLoading(true);
        const mapboxgl = mapboxRef.current ?? (await loadMapbox());
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = token;

        const initialCenter = hasValidCoordinates
          ? [longitude as number, latitude as number]
          : routeStartEnd
            ? [routeStartEnd.start.lon, routeStartEnd.start.lat]
            : (routeCoords && routeCoords.length > 0)
              ? [routeCoords[0].lon, routeCoords[0].lat]
              : [0, 0];

        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: initialCenter as any,
          zoom: MAP_ZOOM,
          pitch: MAP_PITCH,
          bearing: heading || 0,
          attributionControl: false,
          interactive: true,
        });

        mapInstance.addControl(
          new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
          'top-right'
        );

        mapInstance.on('load', () => {
          setMapLoaded(true);
          setMapError(null);
          setMapboxLoading(false);
        });

        mapInstance.on('error', (e) => {
          // In PWA, Mapbox can fail due to WebGL/worker/caching quirks. Prefer a resilient fallback.
          console.warn("[VehicleLocationMap] Mapbox error, falling back to Leaflet", e);
          setMapboxLoading(false);
          setMapError(null);
          setRenderMode("leaflet");
        });

        map.current = mapInstance;
      } catch (error) {
        console.warn("[VehicleLocationMap] Mapbox init failed, falling back to Leaflet", error);
        setMapboxLoading(false);
        setMapError(null);
        setRenderMode("leaflet");
      }
    };

    void initMap();

    return () => {
      marker.current?.remove();
      marker.current = null;
      markerElement.current = null;
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, [mapboxEnabled, renderMode, hasValidCoordinates, hasRoute, routeCoords, routeStartEnd, heading, latitude, longitude]);

  // Update marker when position/status changes
  useEffect(() => {
    if (renderMode !== "mapbox") return;
    if (!map.current || !mapLoaded || !hasValidCoordinates) return;

    const updateMarker = async () => {
      const lng = longitude as number;
      const lat = latitude as number;
      const currentHeading = heading || 0;
      const currentSpeed = speed || 0;

      try {
        const mapboxgl = mapboxRef.current ?? (await loadMapbox());
        mapboxRef.current = mapboxgl;
        
        // OPTIMIZED: Update existing marker instead of recreating
        if (marker.current && markerElement.current) {
          marker.current.setLngLat([lng, lat]);
          markerElement.current.innerHTML = createMarkerHTML(
            vehicleStatus,
            currentHeading,
            currentSpeed
          );
        } else {
          const el = document.createElement('div');
          el.className = 'vehicle-car-marker';
          el.innerHTML = createMarkerHTML(vehicleStatus, currentHeading, currentSpeed);

          markerElement.current = el;
          marker.current = new mapboxgl.Marker({
            element: el,
            anchor: 'center',
            rotationAlignment: 'map',
            pitchAlignment: 'map'
          })
            .setLngLat([lng, lat])
            .addTo(map.current!);
        }

        // Smooth camera follow, but throttle to avoid jank during rapid updates.
        const now = Date.now();
        if (now - lastCameraMoveAtRef.current > 900) {
          lastCameraMoveAtRef.current = now;
          map.current!.easeTo({
            center: [lng, lat],
            duration: MAP_ANIMATION_DURATION,
            essential: true,
          });
        }

      } catch (error) {
        console.error('[Marker Update Error]', error);
      }
    };

    updateMarker();
  }, [renderMode, latitude, longitude, heading, speed, vehicleStatus, mapLoaded, hasValidCoordinates]);

  useEffect(() => {
    if (renderMode !== "mapbox") return;
    if (!map.current || !mapLoaded) return;
    const coords = (routeCoords || []).map(p => [p.lon, p.lat]);
    const hasRoute = coords.length > 1;
    const updateRoute = async () => {
      try {
        const mapboxgl = mapboxRef.current ?? (await loadMapbox());
        mapboxRef.current = mapboxgl;
        const sourceId = 'vehicle-route';
        const layerId = 'vehicle-route-layer';
        if (hasRoute) {
          const data = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            }
          } as any;
          if (map.current!.getSource(sourceId)) {
            const src = map.current!.getSource(sourceId) as any;
            src.setData(data);
          } else {
            map.current!.addSource(sourceId, {
              type: 'geojson',
              data
            } as any);
            map.current!.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': '#3b82f6',
                'line-width': 4,
                'line-opacity': 0.7
              }
            } as any);
          }
        } else {
          if (map.current!.getLayer('vehicle-route-layer')) {
            map.current!.removeLayer('vehicle-route-layer');
          }
          if (map.current!.getSource('vehicle-route')) {
            map.current!.removeSource('vehicle-route');
          }
        }
      } catch {
        void 0;
      }
    };
    updateRoute();
    return () => {
      if (map.current?.getLayer('vehicle-route-layer')) {
        map.current.removeLayer('vehicle-route-layer');
      }
      if (map.current?.getSource('vehicle-route')) {
        map.current.removeSource('vehicle-route');
      }
    };
  }, [renderMode, routeCoords, mapLoaded]);

  useEffect(() => {
    if (renderMode !== "mapbox") return;
    if (!map.current || !mapLoaded) return;
    if (!routeStartEnd) {
      if (map.current.getLayer('route-points-layer')) {
        map.current.removeLayer('route-points-layer');
      }
      if (map.current.getSource('route-points')) {
        map.current.removeSource('route-points');
      }
      return;
    }
    const points = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'start' },
          geometry: {
            type: 'Point',
            coordinates: [routeStartEnd.start.lon, routeStartEnd.start.lat]
          }
        },
        {
          type: 'Feature',
          properties: { kind: 'end' },
          geometry: {
            type: 'Point',
            coordinates: [routeStartEnd.end.lon, routeStartEnd.end.lat]
          }
        }
      ]
    } as any;
    if (map.current.getSource('route-points')) {
      const src = map.current.getSource('route-points') as any;
      src.setData(points);
    } else {
      map.current.addSource('route-points', { type: 'geojson', data: points } as any);
      map.current.addLayer({
        id: 'route-points-layer',
        type: 'circle',
        source: 'route-points',
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'start', '#22c55e',
            'end', '#ef4444',
            '#3b82f6'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      } as any);
    }
  }, [renderMode, routeStartEnd, mapLoaded]);

  function buildCirclePolygon(lat: number, lon: number, radiusMeters: number, steps = 64): number[][] {
    const coords: number[][] = [];
    const dLat = (radiusMeters / 111320);
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * 2 * Math.PI;
      const dLon = (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180)));
      const latOffset = dLat * Math.sin(theta);
      const lonOffset = dLon * Math.cos(theta);
      coords.push([lon + lonOffset, lat + latOffset]);
    }
    return coords;
  }

  useEffect(() => {
    if (renderMode !== "mapbox") return;
    if (!map.current || !mapLoaded) return;
    const zones = (geofences || []).filter(z => z.latitude && z.longitude && z.radius && z.radius > 0);
    const sourceId = 'geofences-source';
    const layerIdFill = 'geofences-fill-layer';
    const layerIdOutline = 'geofences-outline-layer';
    if (zones.length === 0) {
      if (map.current.getLayer(layerIdFill)) map.current.removeLayer(layerIdFill);
      if (map.current.getLayer(layerIdOutline)) map.current.removeLayer(layerIdOutline);
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
      return;
    }
    const features = zones.map(z => ({
      type: 'Feature',
      properties: { name: z.name || 'Zone' },
      geometry: {
        type: 'Polygon',
        coordinates: [buildCirclePolygon(z.latitude, z.longitude, z.radius)]
      }
    }));
    const data = { type: 'FeatureCollection', features } as any;
    if (map.current.getSource(sourceId)) {
      const src = map.current.getSource(sourceId) as any;
      src.setData(data);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data } as any);
      map.current.addLayer({
        id: layerIdFill,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.15
        }
      } as any);
      map.current.addLayer({
        id: layerIdOutline,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#10b981',
          'line-width': 2,
          'line-opacity': 0.8
        }
      } as any);
    }
  }, [renderMode, geofences, mapLoaded]);

  if (!mapboxEnabled) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground opacity-60 mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">Map Disabled</p>
            <p className="text-xs text-muted-foreground">Map loading is disabled to save resources.</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!hasValidCoordinates && !hasRoute) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted animate-pulse mb-3" />
            <p className="text-sm text-muted-foreground">Waiting for GPS signal...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {renderMode === "mapbox" ? (
        <>
          {mapboxLoading && (
            <div
              className={cn(
                "absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm",
                mapHeight
              )}
            >
              <div className="text-sm text-muted-foreground">Loading map...</div>
            </div>
          )}
          <style>{`
            .vehicle-car-marker { cursor: pointer; user-select: none; }
            .car-marker-container { position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transition: transform 0.5s ease-out; }
            .car-pulse { position: absolute; width: 42px; height: 42px; border-radius: 50%; animation: carPulse 2s infinite; pointer-events: none; }
            .car-pulse.orange { background: radial-gradient(circle, rgba(234, 88, 12, 0.4) 0%, rgba(234, 88, 12, 0) 70%); }
            .car-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 1; transition: background 0.3s ease; }
            .car-icon.orange { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; }
            .status-dot { width: 14px; height: 14px; border-radius: 50%; background: #ea580c; box-shadow: 0 2px 4px rgba(0,0,0,0.2); position: relative; }
            .status-dot::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: white; }
            .speed-badge { position: absolute; top: -8px; right: -8px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2; white-space: nowrap; }
            .speed-badge::after { content: ' km/h'; font-size: 7px; font-weight: 400; }
            @keyframes carPulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
            .mapboxgl-popup-content { background: hsl(var(--card)); color: hsl(var(--foreground)); border-radius: 12px; padding: 12px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); border: 1px solid hsl(var(--border)); }
            .mapboxgl-popup-tip { border-top-color: hsl(var(--card)); }
            .mapboxgl-ctrl-group { background: hsl(var(--card)) !important; border: 1px solid hsl(var(--border)) !important; }
            .mapboxgl-ctrl-group button { background: transparent !important; }
            .mapboxgl-ctrl-group button + button { border-top: 1px solid hsl(var(--border)) !important; }
            .mapboxgl-ctrl-icon { filter: invert(1); }
            .mapboxgl-ctrl-bottom-right { top: 6px; left: 6px; right: auto; bottom: auto; }
            .mapboxgl-ctrl-attrib { font-size: 9px; padding: 2px 4px; background: rgba(17, 24, 39, 0.4); border-radius: 6px; }
          `}</style>
          <div
            ref={mapContainer}
            className={cn("w-full rounded-xl overflow-hidden", mapHeight)}
            role="img"
            aria-label={`Map showing ${vehicleName || "vehicle"} at ${address || `${latitude}, ${longitude}`}`}
          />
        </>
      ) : (
        <>
          {mapError ? (
            <div className={cn("w-full rounded-xl bg-destructive/10 flex items-center justify-center", mapHeight)}>
              <div className="text-center p-8">
                <MapPin className="h-12 w-12 mx-auto text-destructive opacity-50 mb-3" />
                <p className="text-sm font-medium text-destructive mb-1">Map Error</p>
                <p className="text-xs text-muted-foreground">{mapError}</p>
              </div>
            </div>
          ) : (
            <LeafletVehicleMap
              latitude={latitude}
              longitude={longitude}
              className={cn("w-full rounded-xl overflow-hidden")}
              mapHeight={mapHeight}
              interactive={true}
              routeCoords={routeCoords}
              routeStartEnd={routeStartEnd}
              geofences={geofences}
            />
          )}
        </>
      )}

      {showAddressCard && (
        <Card className="absolute bottom-3 left-3 right-3 bg-card/95 backdrop-blur-md border-border/50 shadow-lg z-10">
          <div className="p-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg shrink-0 transition-colors",
                vehicleStatus === 'offline' && "bg-gray-500/10",
                vehicleStatus === 'moving' && "bg-blue-500/10",
                vehicleStatus === 'parked' && "bg-green-500/10"
              )}>
                <Navigation className={cn(
                  "h-4 w-4 transition-colors",
                  vehicleStatus === 'offline' && "text-gray-500",
                  vehicleStatus === 'moving' && "text-blue-500",
                  vehicleStatus === 'parked' && "text-green-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground capitalize">
                    {vehicleName || 'Vehicle'} • {vehicleStatus}
                  </span>
                  {vehicleStatus === 'offline' && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-muted/50 text-muted-foreground border-muted">
                      <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                      Offline
                    </Badge>
                  )}
                  {vehicleStatus === 'moving' && (speed || 0) > 0 && (
                    <span className="text-xs font-bold text-primary">
                      {Math.round(speed || 0)} km/h
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-sm font-medium truncate transition-colors",
                  vehicleStatus === 'offline' ? "text-muted-foreground" : "text-foreground"
                )}>
                  {address || `${latitude?.toFixed(5) ?? 0}, ${longitude?.toFixed(5) ?? 0}`}
                  {vehicleStatus === 'offline' && <span className="text-xs ml-1 opacity-70">(Last known)</span>}
                </p>
              </div>
              <a
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "p-2 rounded-lg transition-colors shrink-0",
                  hasValidCoordinates
                    ? "bg-primary/10 hover:bg-primary/20"
                    : "bg-muted/50 opacity-50 pointer-events-none"
                )}
                aria-label="Open in Google Maps"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
              </a>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
