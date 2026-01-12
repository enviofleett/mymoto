import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';

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

    // Public Mapbox token for client-side map rendering
    const token = 'pk.eyJ1IjoibXltb3RvLWFwcCIsImEiOiJjbTU1ajVmMjcwNjRpMmpzOHVsc3E3dG14In0.7MyBLnhhk-xPnLR_AvVfSg';

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

    // Remove existing marker
    marker.current?.remove();

    // Create custom car marker element with rotation based on heading
    const el = document.createElement('div');
    el.className = 'vehicle-car-marker';
    
    // Rotate based on heading
    const rotation = heading || 0;
    
    el.innerHTML = `
      <div class="car-marker-container" style="transform: rotate(${rotation}deg)">
        <div class="car-pulse ${isOnline ? 'online' : 'offline'}"></div>
        <div class="car-icon ${isOnline ? 'online' : 'offline'}">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
          </svg>
        </div>
        ${(speed || 0) > 0 ? `<div class="speed-badge">${Math.round(speed || 0)}</div>` : ''}
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
        .car-pulse.online {
          background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0) 70%);
        }
        .car-pulse.offline {
          background: radial-gradient(circle, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0) 70%);
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
        .car-icon.online {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
        }
        .car-icon.offline {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
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
                isOnline ? "bg-green-500/10" : "bg-red-500/10"
              )}>
                <Navigation className={cn(
                  "h-4 w-4",
                  isOnline ? "text-green-500" : "text-red-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {vehicleName || 'Vehicle'} • {isOnline ? 'Live' : 'Last Known'}
                  </span>
                  {(speed || 0) > 0 && (
                    <span className="text-xs font-bold text-primary">
                      {Math.round(speed || 0)} km/h
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground truncate">
                  {address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
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
