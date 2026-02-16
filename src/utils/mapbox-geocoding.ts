import { invokeEdgeFunction } from "@/integrations/supabase/edge";
import { getMapboxAccessToken, getMapboxGeocodingCountry } from "@/utils/mapbox-config";

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

function shouldUseEdgeFallback(status: number | null, error: unknown): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  if (error instanceof TypeError) return true; // network/CORS failures from fetch
  return false;
}

async function searchViaEdge(query: string, country: string | undefined, limit: number): Promise<MapboxFeature[]> {
  try {
    const data = await invokeEdgeFunction<{ features?: MapboxFeature[] }>("forward-geocode", {
      query,
      country,
      limit,
    });
    return Array.isArray(data?.features) ? data.features : [];
  } catch (error) {
    console.error("Edge geocoding fallback failed:", error);
    return [];
  }
}

/**
 * Search addresses using Mapbox Geocoding API
 * @param query - Search query string
 * @param country - Optional country code override; defaults to VITE_MAPBOX_GEOCODING_COUNTRY (if set)
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of Mapbox features
 */
export async function searchAddresses(
  query: string,
  country?: string,
  limit: number = 5
): Promise<MapboxFeature[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const token = getMapboxAccessToken();
  const resolvedCountry = country?.trim() || getMapboxGeocodingCountry();
  const safeLimit = Math.max(1, Math.min(10, Number.isFinite(limit) ? limit : 5));

  if (!token) {
    console.warn("VITE_MAPBOX_ACCESS_TOKEN not configured; using edge geocoding fallback");
    return searchViaEdge(normalizedQuery, resolvedCountry, safeLimit);
  }

  let status: number | null = null;
  try {
    const params = new URLSearchParams({
      access_token: token,
      limit: String(safeLimit),
      types: "place,address,poi,locality,neighborhood",
    });
    if (resolvedCountry) params.set("country", resolvedCountry);

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalizedQuery)}.json?${params.toString()}`;
    const response = await fetch(url);
    status = response.status;

    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }

    const data: MapboxGeocodingResponse = await response.json();
    return data.features || [];
  } catch (error) {
    if (shouldUseEdgeFallback(status, error)) {
      return searchViaEdge(normalizedQuery, resolvedCountry, safeLimit);
    }
    console.error("Geocoding error:", error);
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
  const token = getMapboxAccessToken();
  
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
