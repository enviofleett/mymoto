
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Search, Loader2, MapPin } from "lucide-react";
import { searchAddresses } from "@/utils/mapbox-geocoding";

interface GeofenceMapProps {
  initialLat?: number;
  initialLng?: number;
  initialRadius?: number;
  onLocationSelect: (lat: number, lng: number, radius: number) => void;
}

export function GeofenceMap({ 
  initialLat = 6.5244, 
  initialLng = 3.3792, 
  initialRadius = 100,
  onLocationSelect 
}: GeofenceMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [radius, setRadius] = useState(initialRadius);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLng, setCurrentLng] = useState(initialLng);
  const { theme } = useTheme();
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      console.error("Mapbox token missing");
      setMapError("Mapbox token missing");
      return;
    }

    mapboxgl.accessToken = token;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
        center: [initialLng, initialLat],
        zoom: 13,
      });

      map.current.on('error', (e) => {
        console.error("Mapbox error:", e);
        if ((e.error as any)?.message?.includes('Forbidden') || (e.error as any)?.status === 401 || (e.error as any)?.status === 403) {
           setMapError("Invalid or restricted Mapbox Token. Please check your token settings.");
        }
      });
    } catch (err: any) {
      console.error("Mapbox init error:", err);
      setMapError("Failed to initialize map: " + err.message);
    }

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Initialize marker
    marker.current = new mapboxgl.Marker({
      draggable: true,
      color: '#ef4444'
    })
      .setLngLat([initialLng, initialLat])
      .addTo(map.current);

    // Handle marker drag
    marker.current.on('dragend', () => {
      const lngLat = marker.current?.getLngLat();
      if (lngLat) {
        updateLocation(lngLat.lat, lngLat.lng);
      }
    });

    // Handle map click
    map.current.on('click', (e) => {
      updateLocation(e.lngLat.lat, e.lngLat.lng);
    });

    // Draw initial radius circle
    map.current.on('load', () => {
      drawRadiusCircle(initialLat, initialLng, initialRadius);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update circle when radius changes
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      drawRadiusCircle(currentLat, currentLng, radius);
      onLocationSelect(currentLat, currentLng, radius);
    }
  }, [radius]);

  const updateLocation = (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
    
    // Move marker
    marker.current?.setLngLat([lng, lat]);
    
    // Pan map if needed
    map.current?.flyTo({ center: [lng, lat], zoom: 14 });

    // Update circle
    drawRadiusCircle(lat, lng, radius);
    
    // Notify parent
    onLocationSelect(lat, lng, radius);
  };

  const drawRadiusCircle = (lat: number, lng: number, radiusMeters: number) => {
    if (!map.current) return;

    const sourceId = 'geofence-source';
    const layerId = 'geofence-layer';
    const outlineId = 'geofence-outline';

    // Create GeoJSON circle
    const points = 64;
    const coords = { latitude: lat, longitude: lng };
    const km = radiusMeters / 1000;
    
    const ret = [];
    const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
    const distanceY = km / 110.574;

    let theta, x, y;
    for(let i=0; i<points; i++) {
      theta = (i / points) * (2 * Math.PI);
      x = distanceX * Math.cos(theta);
      y = distanceY * Math.sin(theta);
      ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]);

    const geoJsonData: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [ret]
      },
      properties: {}
    };

    if (map.current.getSource(sourceId)) {
      (map.current.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geoJsonData);
    } else {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: geoJsonData
      });

      map.current.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        layout: {},
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.2
        }
      });

      map.current.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        layout: {},
        paint: {
          'line-color': '#ef4444',
          'line-width': 2
        }
      });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchAddresses(searchQuery);
      if (results.length > 0) {
        const [lng, lat] = results[0].center;
        updateLocation(lat, lng);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Search location (e.g., Shoprite Ikeja)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={isSearching} variant="secondary">
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Map Container */}
      <div className="relative h-full min-h-[300px] w-full rounded-lg overflow-hidden border border-border bg-muted">
        {mapError ? (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
              <p className="font-semibold mb-1">Map Error</p>
              {mapError}
            </div>
          </div>
        ) : (
          <div ref={mapContainer} className="absolute inset-0" />
        )}
        
        {/* Radius Overlay Info */}
        {!mapError && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur px-3 py-1 rounded-md text-xs shadow-sm">
            Lat: {currentLat.toFixed(4)}, Lng: {currentLng.toFixed(4)}
          </div>
        )}
      </div>

      {/* Radius Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label>Geofence Radius</Label>
          <span className="text-sm font-medium text-muted-foreground">{radius} meters</span>
        </div>
        <Slider
          value={[radius]}
          min={50}
          max={5000}
          step={50}
          onValueChange={(vals) => setRadius(vals[0])}
          className="py-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>50m</span>
          <span>5km</span>
        </div>
      </div>
    </div>
  );
}
