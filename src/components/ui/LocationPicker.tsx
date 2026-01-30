
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

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
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');

  // Default to Lagos, Nigeria if no initial location
  const defaultLat = initialLocation?.latitude || 6.5244;
  const defaultLng = initialLocation?.longitude || 3.3792;

  useEffect(() => {
    if (!mapContainer.current) return;

    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) return;

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
        reverseGeocode(e.lngLat.lng, e.lngLat.lat);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  const onDragEnd = () => {
    if (!marker.current) return;
    const lngLat = marker.current.getLngLat();
    reverseGeocode(lngLat.lng, lngLat.lat);
  };

  const searchAddress = async (searchText: string) => {
    if (!searchText) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchText
        )}.json?access_token=${token}&country=NG&types=place,address,poi`
      );
      const data = await response.json();
      setSuggestions(data.features || []);
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const reverseGeocode = async (lng: number, lat: number) => {
    try {
      const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const cityContext = feature.context?.find((c: any) => c.id.startsWith('place'))?.text || 
                           feature.context?.find((c: any) => c.id.startsWith('region'))?.text || '';
        
        const locationData = {
          address: feature.place_name,
          city: cityContext,
          latitude: lat,
          longitude: lng,
        };

        setSelectedAddress(feature.place_name);
        onLocationSelect(locationData);
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  };

  const handleSuggestionClick = (feature: any) => {
    const [lng, lat] = feature.center;
    
    if (map.current && marker.current) {
      map.current.flyTo({ center: [lng, lat], zoom: 16 });
      marker.current.setLngLat([lng, lat]);
    }

    const cityContext = feature.context?.find((c: any) => c.id.startsWith('place'))?.text || 
                       feature.context?.find((c: any) => c.id.startsWith('region'))?.text || '';

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

      <div className="h-64 w-full rounded-md border overflow-hidden relative">
        <div ref={mapContainer} className="h-full w-full" />
        <div className="absolute bottom-2 right-2 bg-background/90 px-2 py-1 rounded text-xs shadow-sm z-10 pointer-events-none">
          Click map to set location
        </div>
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
