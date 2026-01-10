import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';

interface VehicleLocationMapProps {
  latitude: number;
  longitude: number;
  address?: string | null;
  vehicleName?: string;
  isOnline?: boolean;
  className?: string;
}

export function VehicleLocationMap({
  latitude,
  longitude,
  address,
  vehicleName,
  isOnline = true,
  className,
}: VehicleLocationMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error('VITE_MAPBOX_ACCESS_TOKEN is not set');
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [longitude, latitude],
      zoom: 15,
      attributionControl: false,
      interactive: true,
    });

    // Add minimal navigation control
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'top-left'
    );

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      marker.current?.remove();
      map.current?.remove();
    };
  }, []);

  // Update marker when coordinates change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing marker
    marker.current?.remove();

    // Create custom marker element with pulsing animation
    const el = document.createElement('div');
    el.className = 'vehicle-marker';
    el.innerHTML = `
      <div class="marker-container">
        <div class="marker-pulse ${isOnline ? 'online' : 'offline'}"></div>
        <div class="marker-dot ${isOnline ? 'online' : 'offline'}"></div>
      </div>
    `;

    // Add popup with address if available
    const popupContent = address 
      ? `<div class="text-xs font-medium">${vehicleName || 'Vehicle'}</div><div class="text-xs text-muted-foreground mt-1">${address}</div>`
      : `<div class="text-xs font-medium">${vehicleName || 'Vehicle'}</div>`;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
      .setHTML(popupContent);

    marker.current = new mapboxgl.Marker({ element: el })
      .setLngLat([longitude, latitude])
      .setPopup(popup)
      .addTo(map.current);

    // Show popup by default if address is available
    if (address) {
      marker.current.togglePopup();
    }

    // Pan to new location smoothly
    map.current.flyTo({
      center: [longitude, latitude],
      duration: 1000,
    });
  }, [latitude, longitude, address, vehicleName, isOnline, mapLoaded]);

  return (
    <>
      <style>{`
        .vehicle-marker {
          cursor: pointer;
        }
        .marker-container {
          position: relative;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .marker-pulse {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .marker-pulse.online {
          background: rgba(34, 197, 94, 0.3);
        }
        .marker-pulse.offline {
          background: rgba(239, 68, 68, 0.3);
        }
        .marker-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          z-index: 1;
        }
        .marker-dot.online {
          background: #22c55e;
        }
        .marker-dot.offline {
          background: #ef4444;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .mapboxgl-popup-content {
          background: hsl(var(--card));
          color: hsl(var(--foreground));
          border-radius: 8px;
          padding: 8px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border: 1px solid hsl(var(--border));
        }
        .mapboxgl-popup-tip {
          border-top-color: hsl(var(--card));
        }
      `}</style>
      <div 
        ref={mapContainer} 
        className={cn("w-full h-full", className)}
      />
    </>
  );
}
