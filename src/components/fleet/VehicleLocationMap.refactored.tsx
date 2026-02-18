import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { loadMapbox } from "@/utils/loadMapbox";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { MapPin, Navigation, ExternalLink, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
}

// Vehicle status constants
const SPEED_THRESHOLD = 3; // km/h - below this is considered parked
const MAP_ZOOM = 16;
const MAP_PITCH = 45;
const MAP_ANIMATION_DURATION = 1000; // ms

// Vehicle status type
type VehicleStatus = 'parked' | 'moving' | 'offline';

// Determine vehicle status based on speed and online state
function getVehicleStatus(isOnline: boolean, speed: number): VehicleStatus {
  if (!isOnline) return 'offline';
  return speed >= SPEED_THRESHOLD ? 'moving' : 'parked';
}

// Create the custom marker HTML
function createMarkerHTML(status: VehicleStatus, heading: number, speed: number): string {
  const rotation = status === 'moving' ? heading : 0;
  const showSpeed = status === 'moving' && speed > 0;

  return `
    <div class="car-marker-container" style="transform: rotate(${rotation}deg)">
      <div class="car-pulse ${status}"></div>
      <div class="car-icon ${status}">
        ${status === 'parked' || status === 'offline' ? `
          <div class="status-dot"></div>
        ` : `
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
        `}
      </div>
      ${showSpeed ? `<div class="speed-badge">${Math.round(speed)}</div>` : ''}
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
}: VehicleLocationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const marker = useRef<MapboxMarker | null>(null);
  const markerElement = useRef<HTMLDivElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const { data: mapboxFlag } = useFeatureFlag("mapbox_enabled");
  const mapboxEnabled = mapboxFlag?.enabled ?? true;
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const { data: mapboxFlag } = useFeatureFlag("mapbox_enabled");
  const mapboxEnabled = mapboxFlag?.enabled ?? true;

  // Memoize coordinate validity check
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

  // Memoize vehicle status
  const vehicleStatus = useMemo<VehicleStatus>(() => {
    return getVehicleStatus(isOnline, speed || 0);
  }, [isOnline, speed]);

  // Memoize Google Maps link
  const googleMapsLink = useMemo(() => {
    return hasValidCoordinates
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : '#';
  }, [hasValidCoordinates, latitude, longitude]);

  // Initialize map ONCE when container is ready and we have valid coordinates
  useEffect(() => {
    if (!mapboxEnabled) return;
    if (!mapboxEnabled) return;
    // Guard clauses
    if (!mapContainer.current) {
      console.warn('[VehicleLocationMap] Map container ref not available');
      return;
    }

    if (!hasValidCoordinates) {
      console.warn('[VehicleLocationMap] Invalid coordinates, skipping map initialization');
      return;
    }

    if (map.current) {
      console.log('[VehicleLocationMap] Map already initialized, skipping');
      return;
    }

    // Get Mapbox token
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      const errorMsg = 'VITE_MAPBOX_ACCESS_TOKEN is not set';
      console.error(`[VehicleLocationMap] ${errorMsg}`);
      setMapError(errorMsg);
      return;
    }

    const initMap = async () => {
      try {
      console.log('[VehicleLocationMap] Initializing map at:', {
        latitude,
        longitude,
        heading
      });

        setMapboxLoading(true);
        const mapboxgl = await loadMapbox();
        mapboxgl.accessToken = token;

        // Create map instance
        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [longitude as number, latitude as number],
          zoom: MAP_ZOOM,
          pitch: MAP_PITCH,
          bearing: heading || 0,
          attributionControl: false,
          interactive: true,
        });

        // Add navigation controls
        mapInstance.addControl(
          new mapboxgl.NavigationControl({
            showCompass: true,
            visualizePitch: true
          }),
          'top-right'
        );

        // Handle map load event
        mapInstance.on('load', () => {
          console.log('[VehicleLocationMap] Map loaded successfully');
          setMapLoaded(true);
          setMapError(null);
          setMapboxLoading(false);
        });

        // Handle map errors
        mapInstance.on('error', (e) => {
          console.error('[VehicleLocationMap] Map error:', e);
          setMapError('Failed to load map');
          setMapboxLoading(false);
        });

        map.current = mapInstance;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VehicleLocationMap] Failed to initialize map:', error);
        setMapError(errorMsg);
        setMapboxLoading(false);
      }
    };

    void initMap();

    // Cleanup function
    return () => {
      console.log('[VehicleLocationMap] Cleaning up map instance');
      marker.current?.remove();
      marker.current = null;
      markerElement.current = null;
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, [mapboxEnabled, hasValidCoordinates, latitude, longitude, heading]);

  // Update marker when coordinates, heading, speed, or status change
  useEffect(() => {
    // Guard clauses
    if (!map.current) {
      console.log('[VehicleLocationMap] Map not initialized, skipping marker update');
      return;
    }

    if (!mapLoaded) {
      console.log('[VehicleLocationMap] Map not loaded yet, skipping marker update');
      return;
    }

    if (!hasValidCoordinates) {
      console.log('[VehicleLocationMap] Invalid coordinates, skipping marker update');
      return;
    }

    const lng = longitude as number;
    const lat = latitude as number;
    const currentHeading = heading || 0;
    const currentSpeed = speed || 0;

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[VehicleLocationMap] Updating marker:', {
        latitude: lat,
        longitude: lng,
        heading: currentHeading,
        speed: currentSpeed,
        status: vehicleStatus,
        timestamp: new Date().toISOString()
      });
    }

    try {
      // OPTIMIZATION: Update existing marker if possible, otherwise create new one
      if (marker.current && markerElement.current) {
        // Update marker position
        marker.current.setLngLat([lng, lat]);

        // Update marker HTML (for status/speed/heading changes)
        markerElement.current.innerHTML = createMarkerHTML(
          vehicleStatus,
          currentHeading,
          currentSpeed
        );
      } else {
        // Create new marker
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
          .addTo(map.current);
      }

      // Smoothly pan camera to new location
      map.current.flyTo({
        center: [lng, lat],
        duration: MAP_ANIMATION_DURATION,
        essential: true,
      });

    } catch (error) {
      console.error('[VehicleLocationMap] Failed to update marker:', error);
    }
  }, [
    latitude,
    longitude,
    heading,
    speed,
    vehicleStatus,
    mapLoaded,
    hasValidCoordinates
  ]);

  if (!mapboxEnabled) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl overflow-hidden bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground opacity-60 mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">Map Disabled</p>
            <p className="text-xs text-muted-foreground">Map loading is disabled to save resources.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!mapboxEnabled) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl overflow-hidden bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <MapPin className="h-12 w-12 mx-auto text-muted-foreground opacity-60 mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">Map Disabled</p>
            <p className="text-xs text-muted-foreground">Map loading is disabled to save resources.</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (mapError) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl overflow-hidden bg-destructive/10 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <MapPin className="h-12 w-12 mx-auto text-destructive opacity-50 mb-3" />
            <p className="text-sm font-medium text-destructive mb-1">Map Error</p>
            <p className="text-xs text-muted-foreground">{mapError}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state if no valid coordinates
  if (!hasValidCoordinates) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl overflow-hidden bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted animate-pulse mb-3" />
            <p className="text-sm text-muted-foreground">Waiting for location data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {mapboxLoading && (
        <div className={cn("absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm", mapHeight)}>
          <div className="text-sm text-muted-foreground">Loading map...</div>
        </div>
      )}
      {/* NOTE: Styles are injected here. For production, move to a CSS module or styled-components */}
      <style>{`
        .vehicle-car-marker {
          cursor: pointer;
          user-select: none;
        }
        .car-marker-container {
          position: relative;
          width: 31px;
          height: 31px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.5s ease-out;
        }
        .car-pulse {
          position: absolute;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          animation: carPulse 2s infinite;
          pointer-events: none;
        }
        .car-pulse.parked {
          background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0) 70%);
        }
        .car-pulse.moving {
          background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%);
        }
        .car-pulse.offline {
          background: radial-gradient(circle, rgba(107, 114, 128, 0.4) 0%, rgba(107, 114, 128, 0) 70%);
        }
        .car-icon {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          z-index: 1;
          transition: background 0.3s ease;
        }
        .car-icon.parked {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
        }
        .car-icon.moving {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
        }
        .car-icon.offline {
          background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
          color: white;
        }
        .status-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .speed-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-size: 10px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          z-index: 2;
          white-space: nowrap;
        }
        .speed-badge::after {
          content: ' km/h';
          font-size: 7px;
          font-weight: 400;
        }
        @keyframes carPulse {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
        .mapboxgl-popup-content {
          background: hsl(var(--card));
          color: hsl(var(--foreground));
          border-radius: 12px;
          padding: 12px 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          border: 1px solid hsl(var(--border));
        }
        .mapboxgl-popup-tip {
          border-top-color: hsl(var(--card));
        }
        .mapboxgl-ctrl-group {
          background: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--border)) !important;
        }
        .mapboxgl-ctrl-group button {
          background: transparent !important;
        }
        .mapboxgl-ctrl-group button + button {
          border-top: 1px solid hsl(var(--border)) !important;
        }
        .mapboxgl-ctrl-icon {
          filter: invert(1);
        }
        .mapboxgl-ctrl-bottom-right {
          top: 6px;
          left: 6px;
          right: auto;
          bottom: auto;
        }
        .mapboxgl-ctrl-attrib {
          font-size: 9px;
          padding: 2px 4px;
          background: rgba(17, 24, 39, 0.4);
          border-radius: 6px;
        }
      `}</style>

      <div
        ref={mapContainer}
        className={cn("w-full rounded-xl overflow-hidden", mapHeight)}
        role="img"
        aria-label={`Map showing vehicle location at ${address || `${latitude}, ${longitude}`}`}
      />

      {/* Floating Address Card */}
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground capitalize">
                      {vehicleName || 'Vehicle'} • {vehicleStatus}
                    </span>
                    {vehicleStatus === 'offline' && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-muted/50 text-muted-foreground border-muted">
                        <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                        Offline
                      </Badge>
                    )}
                  </div>
                  {vehicleStatus === 'moving' && (speed || 0) > 0 && (
                    <span className="text-xs font-bold text-primary">
                      {Math.round(speed || 0)} km/h
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-sm font-medium truncate transition-colors",
                  vehicleStatus === 'offline' ? "text-muted-foreground italic" : "text-foreground"
                )}>
                  {vehicleStatus === 'offline'
                    ? "Location unavailable (offline)"
                    : (address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
                  }
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
