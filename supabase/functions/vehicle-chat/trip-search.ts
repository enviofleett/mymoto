import { SupabaseClient } from 'supabase-js'

export interface TripData {
  id: string
  start_time: string
  end_time: string
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
        .from('vehicle_trips')
        .select('id, start_time, end_time, start_location_name, end_location_name, start_address, end_address, distance_km, duration_seconds')
        .eq('device_id', deviceId)
        .or(`start_location_name.ilike.%${loc.match_text}%,end_location_name.ilike.%${loc.match_text}%,start_address.ilike.%${loc.match_text}%,end_address.ilike.%${loc.match_text}%`)
        .order('start_time', { ascending: false })
        .limit(10); // Fetch top 10 most recent

      if (tripError) {
          console.error('[Trip Search] Trip fetch error:', tripError);
          return { type: 'error', message: 'Failed to retrieve trip details' };
      }

      return { 
        type: 'success', 
        trips: trips || [], 
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
