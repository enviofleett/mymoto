// Use Mapbox token from environment
import pLimit from "p-limit";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Limit concurrent requests to 2 to prevent 429 errors
const limit = pLimit(2);

export async function getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
  // Fallback if no token configured
  if (!MAPBOX_ACCESS_TOKEN) {
    console.warn('MAPBOX_ACCESS_TOKEN not configured');
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  // Validate coordinates
  if (isNaN(lat) || isNaN(lon)) {
    console.warn('Invalid coordinates for geocoding:', { lat, lon });
    return 'Invalid Location';
  }

  return limit(async () => {
    const MAX_RETRIES = 3;
    let lastError;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        // Mapbox uses longitude,latitude order (opposite of most APIs)
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          // Handle 4xx/5xx errors specifically
          if (response.status === 401 || response.status === 403) {
             console.error('Mapbox API token invalid or restricted');
             return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          }
          if (response.status === 429) {
             // If rate limited, wait longer before retry
             const retryAfter = response.headers.get('Retry-After');
             const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (i + 1);
             await new Promise(resolve => setTimeout(resolve, waitTime));
             throw new Error(`Rate limited, retrying after ${waitTime}ms`);
          }
          throw new Error(`Mapbox API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Return the place_name of the first feature, or fallback to coordinates
        if (data.features && data.features.length > 0) {
          return data.features[0].place_name;
        }

        return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      } catch (error: any) {
        // Ignore abort errors (user navigated away)
        if (error.name === 'AbortError') {
          return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }

        lastError = error;
        // Only log warning for intermediate failures
        if (i < MAX_RETRIES - 1) {
          console.warn(`Geocoding attempt ${i + 1} failed, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Simple backoff
        }
      }
    }

    console.error('Geocoding final failure:', lastError);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  });
}
