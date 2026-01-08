const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export async function getAddressFromCoordinates(lat: number, lon: number): Promise<string> {
  // Fallback if no token configured
  if (!MAPBOX_ACCESS_TOKEN) {
    console.warn('MAPBOX_ACCESS_TOKEN not configured');
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  try {
    // Mapbox uses longitude,latitude order (opposite of most APIs)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Return the place_name of the first feature, or fallback to coordinates
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name;
    }

    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch (error) {
    console.error('Geocoding error:', error);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}
