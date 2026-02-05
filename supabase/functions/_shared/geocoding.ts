/**
 * Geocoding Utilities for Edge Functions
 *
 * Uses Mapbox API for reverse geocoding (coordinates to address).
 * Falls back to Google Maps link if Mapbox token is not available.
 */

declare const Deno: any;

export interface GeocodingResult {
  address: string;
  mapUrl: string;
  staticMapUrl: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

/**
 * Reverse geocode coordinates to get address and map links
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');

  // Generate map URLs (always available)
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const mapboxStaticUrl = MAPBOX_ACCESS_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+3b82f6(${lng},${lat})/${lng},${lat},15,0/400x300@2x?access_token=${MAPBOX_ACCESS_TOKEN}`
    : null;

  // Validate coordinates
  if (!lat || !lng || (lat === 0 && lng === 0)) {
    return {
      address: 'Location unavailable',
      mapUrl: googleMapsUrl,
      staticMapUrl: mapboxStaticUrl || googleMapsUrl,
      coordinates: { lat, lng }
    };
  }

  // Try Mapbox reverse geocoding if token is available
  if (MAPBOX_ACCESS_TOKEN) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place,locality,neighborhood`;

      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          // Get the most relevant feature
          const feature = data.features[0];
          const placeName = feature.place_name || feature.text;

          // Extract a shorter, cleaner address
          const address = formatAddress(placeName);

          return {
            address,
            mapUrl: googleMapsUrl,
            staticMapUrl: mapboxStaticUrl || googleMapsUrl,
            coordinates: { lat, lng }
          };
        }
      }
    } catch (error) {
      console.warn('[Geocoding] Mapbox reverse geocoding failed:', error);
    }
  }

  // Fallback: Return coordinates with map link
  return {
    address: `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    mapUrl: googleMapsUrl,
    staticMapUrl: mapboxStaticUrl || googleMapsUrl,
    coordinates: { lat, lng }
  };
}

/**
 * Format a place name into a cleaner address
 */
function formatAddress(placeName: string): string {
  if (!placeName) return 'Unknown location';

  // Split by comma and take first 2-3 parts for a cleaner address
  const parts = placeName.split(',').map(p => p.trim());

  if (parts.length <= 2) {
    return placeName;
  }

  // Return first 2-3 meaningful parts
  return parts.slice(0, 3).join(', ');
}

/**
 * Generate a Google Maps directions URL
 */
export function getDirectionsUrl(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): string {
  return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`;
}
