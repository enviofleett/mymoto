// Mapbox Geocoding Utility
export interface MapboxFeature {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  properties: {
    accuracy?: string;
    [key: string]: any;
  };
  text: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  geometry: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  context?: Array<{
    id: string;
    text: string;
    [key: string]: any;
  }>;
}

export interface MapboxGeocodingResponse {
  type: string;
  query: string[];
  features: MapboxFeature[];
  attribution: string;
}

/**
 * Search addresses using Mapbox Geocoding API
 * @param query - Search query string
 * @param country - Optional country code (default: 'NG' for Nigeria)
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of Mapbox features
 */
export async function searchAddresses(
  query: string,
  country: string = 'NG',
  limit: number = 5
): Promise<MapboxFeature[]> {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  
  if (!token) {
    console.warn('VITE_MAPBOX_ACCESS_TOKEN not configured');
    return [];
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=${country}&limit=${limit}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }

    const data: MapboxGeocodingResponse = await response.json();
    return data.features || [];
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}

/**
 * Get static map image URL from Mapbox
 * @param lng - Longitude
 * @param lat - Latitude
 * @param width - Image width (default: 400)
 * @param height - Image height (default: 200)
 * @param zoom - Zoom level (default: 15)
 * @param style - Map style (default: 'streets-v12')
 * @returns Static map image URL
 */
export function getStaticMapUrl(
  lng: number,
  lat: number,
  width: number = 400,
  height: number = 200,
  zoom: number = 15,
  style: string = 'streets-v12'
): string {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  
  if (!token) {
    console.warn('VITE_MAPBOX_ACCESS_TOKEN not configured');
    return '';
  }

  // Mapbox Static Images API format
  // pin-s+ff0000(lng,lat) for red marker
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/pin-s+ff0000(${lng},${lat})/${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${token}`;
}

/**
 * Extract city from address string
 * @param address - Full address string
 * @returns City name or empty string
 */
export function extractCity(address: string | undefined): string {
  if (!address) return '';
  
  // Try to extract city from common address formats
  // Format: "Street, City, State, Country"
  const parts = address.split(',').map(p => p.trim());
  
  // Usually city is second-to-last or third-to-last
  if (parts.length >= 2) {
    return parts[parts.length - 2] || parts[parts.length - 3] || '';
  }
  
  return '';
}
