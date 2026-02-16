
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { loadMapbox } from "@/utils/loadMapbox";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getAddressFromCoordinates } from "@/utils/geocoding";
import { extractCity, searchAddresses, type MapboxFeature } from "@/utils/mapbox-geocoding";

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    return !!gl2;
  } catch {
    return false;
  }
}

const LocationPickerLeafletMapClient = lazy(async () => {
  const m = await import("./LocationPickerLeafletMap.client");
  return { default: m.LocationPickerLeafletMapClient };
});

interface LocationPickerProps {
  onLocationSelect: (location: {
    address: string;
    city: string;
    latitude: number;
    longitude: number;
  }) => void;
  initialLocation?: {
    latitude: number;
    longitude: number;
  };
}

export function LocationPicker({ onLocationSelect, initialLocation }: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const marker = useRef<MapboxMarker | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const { data: mapboxFlag } = useFeatureFlag("mapbox_enabled");
  const mapboxEnabled = mapboxFlag?.enabled ?? true;
  const [renderMode, setRenderMode] = useState<"mapbox" | "leaflet">("mapbox");

  // Default to Lagos, Nigeria if no initial location
  const defaultLat = initialLocation?.latitude || 6.5244;
  const defaultLng = initialLocation?.longitude || 3.3792;
  const [pickedLat, setPickedLat] = useState(defaultLat);
  const [pickedLng, setPickedLng] = useState(defaultLng);

  useEffect(() => {
    setPickedLat(defaultLat);
    setPickedLng(defaultLng);
  }, [defaultLat, defaultLng]);

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

  useEffect(() => {
    if (!mapboxEnabled) return;
    if (renderMode !== "mapbox") return;
    if (!mapContainer.current) return;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) return;

    const initMap = async () => {
      setMapboxLoading(true);
      try {
        const mapboxgl = await loadMapbox();
        mapboxgl.accessToken = token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [defaultLng, defaultLat],
          zoom: 12,
        });

        map.current.addControl(new mapboxgl.NavigationControl());

        // Initialize marker
        marker.current = new mapboxgl.Marker({
          draggable: true,
          color: '#EA580C', // Orange-600
        })
          .setLngLat([defaultLng, defaultLat])
          .addTo(map.current);

        marker.current.on('dragend', onDragEnd);

        // Map click listener
        map.current.on('click', (e) => {
          if (marker.current) {
            marker.current.setLngLat(e.lngLat);
            setPickedLat(e.lngLat.lat);
            setPickedLng(e.lngLat.lng);
            reverseGeocode(e.lngLat.lng, e.lngLat.lat);
          }
        });
      } finally {
        setMapboxLoading(false);
      }
    };

    void initMap();

    return () => {
      marker.current?.remove();
      map.current?.remove();
    };
  }, [mapboxEnabled, renderMode, defaultLat, defaultLng]);

  const onDragEnd = () => {
    if (!marker.current) return;
    const lngLat = marker.current.getLngLat();
    setPickedLat(lngLat.lat);
    setPickedLng(lngLat.lng);
    reverseGeocode(lngLat.lng, lngLat.lat);
  };

  const searchAddress = async (searchText: string) => {
    if (!searchText) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchAddresses(searchText);
      setSuggestions(results);
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const reverseGeocode = async (lng: number, lat: number) => {
    try {
      const address = await getAddressFromCoordinates(lat, lng);
      const city = extractCity(address);
      const locationData = { address, city, latitude: lat, longitude: lng };
      setSelectedAddress(address);
      onLocationSelect(locationData);
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  };

  const handleSuggestionClick = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    
    if (map.current && marker.current) {
      map.current.flyTo({ center: [lng, lat], zoom: 16 });
      marker.current.setLngLat([lng, lat]);
    }

    const cityContext =
      feature.context?.find((c) => c.id.startsWith('place'))?.text ||
      feature.context?.find((c) => c.id.startsWith('region'))?.text ||
      '';

    const locationData = {
      address: feature.place_name,
      city: cityContext,
      latitude: lat,
      longitude: lng,
    };

    setSelectedAddress(feature.place_name);
    setQuery(feature.place_name);
    setSuggestions([]);
    onLocationSelect(locationData);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="location-search">Office Address</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="location-search"
            placeholder="Search address or city..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              searchAddress(e.target.value);
            }}
            className="pl-9"
          />
          {isSearching && (
            <div className="absolute right-3 top-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        
        {suggestions.length > 0 && (
          <Card className="absolute z-50 w-full mt-1 max-h-60 overflow-auto shadow-lg">
            <ul className="py-1">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="px-4 py-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-2"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{suggestion.place_name}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="h-64 w-full rounded-md border overflow-hidden relative bg-muted/30">
        {!mapboxEnabled ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Map disabled to save resources
          </div>
        ) : renderMode === "mapbox" ? (
          <>
            <div ref={mapContainer} className="h-full w-full" />
            {mapboxLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <div className="text-sm text-muted-foreground">Loading map...</div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 bg-background/90 px-2 py-1 rounded text-xs shadow-sm z-10 pointer-events-none">
              Click map to set location
            </div>
          </>
        ) : (
          <>
            {typeof window === "undefined" ? null : (
              <Suspense fallback={<div className="h-full w-full" />}>
                <LocationPickerLeafletMapClient
                  lat={pickedLat}
                  lng={pickedLng}
                  onPick={(lat, lng) => {
                    setPickedLat(lat);
                    setPickedLng(lng);
                    void reverseGeocode(lng, lat);
                  }}
                />
              </Suspense>
            )}
            <div className="absolute bottom-2 right-2 bg-background/90 px-2 py-1 rounded text-xs shadow-sm z-10 pointer-events-none">
              Tap map to set location
            </div>
          </>
        )}
      </div>

      {selectedAddress && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded flex items-start gap-2">
          <MapPin className="h-4 w-4 mt-0.5 text-primary" />
          <span>{selectedAddress}</span>
        </div>
      )}
    </div>
  );
}
