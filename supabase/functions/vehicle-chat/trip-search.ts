import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { validateTrip } from './trip-utils.ts'
import { reverseGeocode } from '../_shared/geocoding.ts'
import { filterTripsByLocation } from './trip-search-core.ts'

export interface TripData {
  id: string
  start_time: string
  end_time?: string | null
  start_location_name?: string
  end_location_name?: string
  start_address?: string
  end_address?: string
  distance_km: number
  duration_seconds: number
}

export interface ClarificationSuggestion {
  name: string
  type: 'location' | 'address' | 'district' | 'poi'
}

export type SearchResponse = 
  | { type: 'success'; trips: TripData[]; locationName: string }
  | { type: 'clarification'; suggestions: ClarificationSuggestion[] }
  | { type: 'empty'; message: string }
  | { type: 'error'; message: string }

export async function handleTripSearch(
  supabase: SupabaseClient,
  query: string,
  deviceId: string
): Promise<SearchResponse | null> {
  // Simple regex to extract location entity
  // Matches "trips to [Location]", "visited [Location]", "rides from [Location]"
  const locationMatch = query.match(/(?:to|from|at|in|visit|visiting|near|around)\s+(.+?)(?:\?|$|\s+(?:last|yesterday|today|this|week|month))/i);
  
  // If regex fails, but query contains "trips" or "rides" and isn't just that word, try to use the rest
  let searchTerm = locationMatch ? locationMatch[1].trim() : '';
  
  if (!searchTerm) {
    // Fallback: if query is short and doesn't look like a command, treat it as a location if specifically asked about trips
    if (query.match(/trips|rides|history/i) && query.split(' ').length > 1) {
       const clean = query.replace(/show|me|my|trips|rides|history|did|i|visit|go|to|from/gi, '').trim();
       if (clean.length > 2) searchTerm = clean;
    }
  }

  if (!searchTerm || searchTerm.length < 3) {
      return null; // Not a definitive location search
  }

  console.log(`[Trip Search] Detected search term: "${searchTerm}"`);

  try {
    // Step A: Search for unique matching locations
    const { data: matches, error } = await supabase.rpc('search_locations_fuzzy', {
      search_query: searchTerm,
      limit_count: 5 // Keep it tight for clarification
    });

    if (error) {
      console.error('[Trip Search] RPC error:', error);
      return { type: 'error', message: 'Database search failed' };
    }

    const uniqueLocations = matches || [];
    console.log(`[Trip Search] Found ${uniqueLocations.length} matches`);

    // Step B: Analyze Count
    
    // Case 0: No matches
    if (uniqueLocations.length === 0) {
      return { type: 'empty', message: `I couldn't find any trips related to "${searchTerm}".` };
    }

    // Case 1: Exact Single Match -> Fetch Trips
    if (uniqueLocations.length === 1) {
      const loc = uniqueLocations[0];
      console.log(`[Trip Search] Single match found: ${loc.match_text}. Fetching trips...`);
      
      const { data: trips, error: tripError } = await supabase
        .from('gps51_trips')
        .select('id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_meters, duration_seconds, max_speed_kmh, avg_speed_kmh')
        .eq('device_id', deviceId)
        .order('start_time', { ascending: false })
        .limit(80); // Fetch enough trips to find location matches reliably

      if (tripError) {
          console.error('[Trip Search] Trip fetch error:', tripError);
          return { type: 'error', message: 'Failed to retrieve trip details' };
      }

      const addressCache = new Map<string, string>()

      const resolveAddress = async (lat?: number | null, lng?: number | null): Promise<string | undefined> => {
        if (lat == null || lng == null || lat === 0 || lng === 0) return undefined
        const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
        if (addressCache.has(key)) return addressCache.get(key)
        try {
          const geocode = await reverseGeocode(lat, lng)
          const address = geocode.address || ''
          addressCache.set(key, address)
          return address
        } catch {
          addressCache.set(key, '')
          return undefined
        }
      }

      const matchingTrips = await filterTripsByLocation(
        (trips || []) as any[],
        loc.match_text || searchTerm,
        resolveAddress,
        (trip) => validateTrip(trip),
        10
      )

      if (matchingTrips.length === 0) {
        return { type: 'empty', message: `I found "${loc.match_text}" as a location, but there are no matching trips in the current GPS51 trip history window.` }
      }

      return { 
        type: 'success', 
        trips: matchingTrips, 
        locationName: loc.match_text 
      };
    }

    // Case > 1: Ambiguity -> Request Clarification
    // Check if one match is EXACTLY the search term (case insensitive)
    const exactMatch = uniqueLocations.find((m: any) => m.match_text.toLowerCase() === searchTerm.toLowerCase());
    if (exactMatch) {
        // If exact match exists, prioritize it but maybe still offer others? 
        // Requirement says "If > 1 match... return structured response".
        // I'll stick to strict requirement: > 1 match = ambiguity.
        return { 
            type: 'clarification', 
            suggestions: uniqueLocations.map((m: any) => ({ name: m.match_text, type: m.match_type })) 
        };
    }

    return { 
      type: 'clarification', 
      suggestions: uniqueLocations.map((m: any) => ({ name: m.match_text, type: m.match_type })) 
    };

  } catch (err) {
    console.error('[Trip Search] Unexpected error:', err);
    return { type: 'error', message: 'An unexpected error occurred during search' };
  }
}
