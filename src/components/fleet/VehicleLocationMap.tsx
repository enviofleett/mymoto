import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { MapPin, Navigation, ExternalLink, WifiOff, RefreshCw } from 'lucide-react';
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
  isRefreshing?: boolean;
  onRefresh?: () => void;
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
  isRefreshing,
  onRefresh,
}: VehicleLocationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const markerElement = useRef<HTMLDivElement | null>(null);
  const isMapInitialized = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const lastCoordinates = useRef<{ lat: number; lng: number } | null>(null);

  // Robust check for valid coordinates
  const hasValidCoordinates = 
    typeof latitude === 'number' && 
    typeof longitude === 'number' && 
    !isNaN(latitude) && 
    !isNaN(longitude) &&
    latitude !== 0 && 
    longitude !== 0;

  // 1. Initialize map ONCE
  useEffect(() => {
    if (!mapContainer.current || isMapInitialized.current) return;

    // Use a default center if no coordinates yet (e.g., Abuja) or 0,0
    const initialLat = hasValidCoordinates ? latitude : 9.0765;
    const initialLng = hasValidCoordinates ? longitude : 7.3986;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error('[VehicleLocationMap] VITE_MAPBOX_ACCESS_TOKEN is not set');
      return;
    }

<<<<<<< HEAD
=======
    if (import.meta.env.DEV) {
      console.log('[VehicleLocationMap] Initializing map with coordinates:', { latitude, longitude });
    }
>>>>>>> 7960e14 (feat: Add GPS51 trip source tracking and 24-hour sync improvements)
    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Optimized dark mode
      center: [initialLng, initialLat],
      zoom: hasValidCoordinates ? 16 : 10,
      pitch: 45,
      bearing: heading || 0,
      attributionControl: false,
      interactive: true,
    });

    // Add controls
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right'
    );

    map.current.on('load', () => {
      if (import.meta.env.DEV) {
        console.log('[VehicleLocationMap] Map loaded successfully');
      }
      setMapLoaded(true);
      // Force resize to prevent blank canvas issues
      map.current?.resize();
    });

    isMapInitialized.current = true;

    return () => {
      marker.current?.remove();
      map.current?.remove();
      map.current = null;
      isMapInitialized.current = false;
    };
  }, []); // Run only once on mount

  // 2. Update Map Camera & Marker (The "FlyTo" Logic)
  useEffect(() => {
    if (!map.current || !mapLoaded || !hasValidCoordinates) return;

    const lat = latitude as number;
    const lng = longitude as number;

<<<<<<< HEAD
    // A. Update Camera (Smooth Pan)
    map.current.flyTo({
      center: [lng, lat],
      bearing: (speed || 0) > 5 ? (heading || 0) : map.current.getBearing(), // Only rotate if moving
      zoom: 16,
      speed: 1.5, // Make it snappier
      curve: 1,
      essential: true
    });

    // B. Create Marker Element if it doesn't exist
    if (!markerElement.current) {
      const el = document.createElement('div');
      el.className = 'vehicle-car-marker';
      markerElement.current = el;
      
      marker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map.current);
    }

    // C. Update Marker Content (DOM Manipulation is faster than re-creating)
    if (markerElement.current && marker.current) {
      // Move marker
      marker.current.setLngLat([lng, lat]);

      // Calculate status for styling
      const currentSpeed = speed || 0;
      const isParked = isOnline && currentSpeed < 3;
      const isMoving = isOnline && currentSpeed >= 3;
      
      let statusClass = !isOnline ? 'offline' : (isParked ? 'parked' : 'moving');
      const rotation = isMoving ? (heading || 0) : 0;

      // Update inner HTML
      markerElement.current.innerHTML = `
        <div class="car-marker-container" style="transform: rotate(${rotation}deg)">
          <div class="car-pulse ${statusClass}"></div>
          <div class="car-icon ${statusClass}">
            ${isParked || !isOnline ? 
              `<div class="status-dot"></div>` : 
              `<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
              </svg>`
            }
          </div>
          ${isMoving ? `<div class="speed-badge">${Math.round(currentSpeed)}</div>` : ''}
        </div>
      `;
    }

=======
    // CRITICAL FIX: Use very small threshold for realtime updates (0.000001 = ~0.11 meters)
    // This ensures even tiny movements from GPS updates are reflected immediately
    const COORD_THRESHOLD = 0.000001; // ~0.11 meters - sensitive enough for realtime tracking
    const coordsChanged = !lastCoordinates.current || 
      Math.abs(lastCoordinates.current.lat - lat) > COORD_THRESHOLD || 
      Math.abs(lastCoordinates.current.lng - lng) > COORD_THRESHOLD;

    // CRITICAL FIX: Always update marker for realtime updates
    // Even if coordinates haven't changed significantly, speed/heading/status might have
    // This ensures the UI reflects the latest vehicle state immediately
    const shouldUpdateMarker = true; // Always update for realtime responsiveness

    // Update last known coordinates
    lastCoordinates.current = { lat, lng };

    // Debug logging for coordinate changes
    if (import.meta.env.DEV) {
      console.log('[VehicleLocationMap] Updating marker (REALTIME):', {
        latitude: lat,
        longitude: lng,
        heading,
        speed,
        isOnline,
        coordsChanged,
        timestamp: new Date().toISOString()
      });
    }

    // CRITICAL FIX: Always update marker for realtime responsiveness
    // Remove existing marker to recreate with latest state
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

    // Pan to new location if coordinates changed significantly
    // For small movements (parked vehicle), just update marker position
    if (coordsChanged) {
      const distance = lastCoordinates.current 
        ? Math.sqrt(
            Math.pow((lastCoordinates.current.lat - lat) * 111, 2) + 
            Math.pow((lastCoordinates.current.lng - lng) * 111 * Math.cos(lat * Math.PI / 180), 2)
          )
        : Infinity;
      
      // Only fly/pan if movement is significant (> 10 meters)
      if (distance > 0.01) {
        map.current.flyTo({
          center: [lng, lat],
          duration: 1000,
          essential: true,
        });
      } else {
        // Small movement - just update marker position smoothly
        map.current.easeTo({
          center: [lng, lat],
          duration: 500,
        });
      }
    }
>>>>>>> 7960e14 (feat: Add GPS51 trip source tracking and 24-hour sync improvements)
  }, [latitude, longitude, heading, speed, isOnline, mapLoaded, hasValidCoordinates]);

  // Google Maps fallback link
  const googleMapsLink = hasValidCoordinates 
    ? `https://www.google.com/maps?q=$${latitude},${longitude}`
    : '#';

  return (
    <div className={cn("relative", className)}>
      <style>{`
        .vehicle-car-marker { cursor: pointer; z-index: 10; }
        .car-marker-container { position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .car-pulse { position: absolute; width: 60px; height: 60px; border-radius: 50%; animation: carPulse 2s infinite; }
        .car-pulse.parked { background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0) 70%); }
        .car-pulse.moving { background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%); }
        .car-pulse.offline { background: radial-gradient(circle, rgba(107, 114, 128, 0.4) 0%, rgba(107, 114, 128, 0) 70%); }
        .car-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 2; transition: background-color 0.3s ease; }
        .car-icon.parked { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; }
        .car-icon.moving { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; }
        .car-icon.offline { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; }
        .status-dot { width: 16px; height: 16px; border-radius: 50%; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .speed-badge { position: absolute; top: -5px; right: -5px; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 3; }
        .speed-badge::after { content: ' km/h'; font-size: 7px; font-weight: 400; opacity: 0.8; }
        @keyframes carPulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.0); opacity: 0; } }
      `}</style>
      
      {/* MAP CONTAINER: Always rendered to prevent resets */}
      <div 
        ref={mapContainer} 
        className={cn("w-full rounded-xl overflow-hidden bg-muted/20", mapHeight)}
      />
      
      {/* LOADING OVERLAY: Shown when map isn't ready or coords invalid */}
      {(!mapLoaded || !hasValidCoordinates) && (
        <div className={cn("absolute inset-0 z-20 flex items-center justify-center bg-card/80 backdrop-blur-sm rounded-xl", mapHeight)}>
          <div className="text-center p-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-pulse mb-3">
               <MapPin className="h-6 w-6 text-primary/50" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {!hasValidCoordinates ? 'Waiting for GPS...' : 'Initializing Map...'}
            </p>
            {onRefresh && (
               <button 
                 onClick={onRefresh}
                 className="mt-4 text-xs text-primary flex items-center gap-1 mx-auto hover:underline"
                 disabled={isRefreshing}
               >
                 <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                 Refresh
               </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Address Card */}
      {showAddressCard && hasValidCoordinates && mapLoaded && (
        <Card className="absolute bottom-3 left-3 right-3 bg-card/90 backdrop-blur-md border-white/10 shadow-xl z-10 animate-in slide-in-from-bottom-2">
          <div className="p-3">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg shrink-0 transition-colors",
                !isOnline ? "bg-gray-500/10" : (speed || 0) >= 3 ? "bg-blue-500/10" : "bg-green-500/10"
              )}>
                <Navigation className={cn(
                  "h-4 w-4",
                  !isOnline ? "text-gray-500" : (speed || 0) >= 3 ? "text-blue-500" : "text-green-500"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">
                    {vehicleName || 'Vehicle'}
                  </span>
                  {!isOnline && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] border-red-500/30 text-red-500">
                      <WifiOff className="h-2 w-2 mr-0.5" /> Offline
                    </Badge>
                  )}
                  {isOnline && (speed || 0) >= 3 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-0">
                       Moving
                    </Badge>
                  )}
                </div>
                <p className={cn(
                  "text-xs font-medium truncate",
                  !isOnline ? "text-muted-foreground italic" : "text-muted-foreground"
                )}>
                  {address || `${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`}
                </p>
              </div>
              <a
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
                title="Open in Google Maps"
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
