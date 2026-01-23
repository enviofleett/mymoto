import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const isMapInitialized = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Check if we have valid coordinates
  const hasValidCoordinates = latitude !== null && latitude !== undefined && 
                               longitude !== null && longitude !== undefined;

  // Initialize map ONCE when container is ready and we have valid coordinates
  useEffect(() => {
    if (!mapContainer.current || !hasValidCoordinates || isMapInitialized.current) return;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error('[VehicleLocationMap] VITE_MAPBOX_ACCESS_TOKEN is not set');
      return;
    }

    console.log('[VehicleLocationMap] Initializing map with coordinates:', { latitude, longitude });
    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [longitude as number, latitude as number],
      zoom: 16,
      pitch: 45,
      bearing: heading || 0,
      attributionControl: false,
      interactive: true,
    });

    // Add navigation control
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right'
    );

    map.current.on('load', () => {
      console.log('[VehicleLocationMap] Map loaded successfully');
      setMapLoaded(true);
    });

    isMapInitialized.current = true;

    return () => {
      marker.current?.remove();
      map.current?.remove();
      map.current = null;
      isMapInitialized.current = false;
      setMapLoaded(false);
    };
  }, [hasValidCoordinates]);

  // Update marker when coordinates or heading change
  useEffect(() => {
    if (!map.current || !mapLoaded || !hasValidCoordinates) return;

    const lng = longitude as number;
    const lat = latitude as number;

    // Debug logging for coordinate changes
    if (process.env.NODE_ENV === 'development') {
      console.log('[VehicleLocationMap] Coordinates changed:', {
        latitude: lat,
        longitude: lng,
        heading,
        speed,
        isOnline,
        timestamp: new Date().toISOString()
      });
    }

    // Remove existing marker
    marker.current?.remove();

    // Determine vehicle status: parked, moving, or offline
    const currentSpeed = speed || 0;
    const isParked = isOnline && currentSpeed < 3; // Parked if online and speed < 3 km/h
    const isMoving = isOnline && currentSpeed >= 3; // Moving if online and speed >= 3 km/h
    const isOffline = !isOnline; // Offline if not online

    // Determine status class
    let statusClass = 'offline';
    if (isParked) statusClass = 'parked';
    else if (isMoving) statusClass = 'moving';
    else if (isOffline) statusClass = 'offline';

    // Create custom car marker element with rotation based on heading
    const el = document.createElement('div');
    el.className = 'vehicle-car-marker';
    
    // Rotate based on heading (only rotate if moving)
    const rotation = isMoving ? (heading || 0) : 0;
    
    el.innerHTML = `
      <div class="car-marker-container" style="transform: rotate(${rotation}deg)">
        <div class="car-pulse ${statusClass}"></div>
        <div class="car-icon ${statusClass}">
          ${isParked || isOffline ? `
            <div class="status-dot"></div>
          ` : `
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
          `}
        </div>
        ${isMoving && currentSpeed > 0 ? `<div class="speed-badge">${Math.round(currentSpeed)}</div>` : ''}
      </div>
    `;

    marker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Pan to new location smoothly
    map.current.flyTo({
      center: [lng, lat],
      duration: 1000,
      essential: true,
    });
  }, [latitude, longitude, heading, speed, isOnline, mapLoaded, hasValidCoordinates]);

  const googleMapsLink = hasValidCoordinates 
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : '#';

  // Show loading state if no valid coordinates
  if (!hasValidCoordinates) {
    return (
      <div className={cn("relative", className)}>
        <div className={cn("w-full rounded-xl overflow-hidden bg-muted/50 flex items-center justify-center", mapHeight)}>
          <div className="text-center p-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-muted animate-pulse mb-3" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <style>{`
        .vehicle-car-marker {
          cursor: pointer;
        }
        .car-marker-container {
          position: relative;
          width: 48px;
          height: 48px;
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
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          z-index: 1;
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
      `}</style>
      
      <div 
        ref={mapContainer} 
        className={cn("w-full rounded-xl overflow-hidden", mapHeight)}
      />
      
      {/* Floating Address Card */}
      {showAddressCard && (
        <Card className="absolute bottom-3 left-3 right-3 bg-card/95 backdrop-blur-md border-border/50 shadow-lg z-10">
          <div className="p-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg shrink-0",
                !isOnline ? "bg-gray-500/10" : (speed || 0) >= 3 ? "bg-blue-500/10" : "bg-green-500/10"
              )}>
                <Navigation className={cn(
                  "h-4 w-4",
                  !isOnline ? "text-gray-500" : (speed || 0) >= 3 ? "text-blue-500" : "text-green-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {vehicleName || 'Vehicle'} • {
                        !isOnline ? 'Offline' : 
                        (speed || 0) >= 3 ? 'Moving' : 
                        'Parked'
                      }
                    </span>
                    {!isOnline && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-muted/50 text-muted-foreground border-muted">
                        <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                        Offline
                      </Badge>
                    )}
                  </div>
                  {(speed || 0) > 0 && (
                    <span className="text-xs font-bold text-primary">
                      {Math.round(speed || 0)} km/h
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-sm font-medium truncate",
                  !isOnline ? "text-muted-foreground italic" : "text-foreground"
                )}>
                  {!isOnline 
                    ? "Location unavailable (offline)"
                    : (address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
                  }
                </p>
              </div>
              <a
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
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
