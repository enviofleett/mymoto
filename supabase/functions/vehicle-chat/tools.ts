import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleTripSearch } from './trip-search.ts'

// ============================================================================
// Types
// ============================================================================

export interface ToolContext {
  supabase: SupabaseClient
  device_id: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: any // JSON Schema
  execute: (args: any, context: ToolContext) => Promise<any>
}

// ============================================================================
// Validation Logic (Moved from index.ts)
// ============================================================================

function haversineDistanceValidator(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function validateTrip(trip: any, index: number, allTrips: any[]): any {
  const issues: string[] = []
  let confidence = 1.0
  let dataQuality: 'high' | 'medium' | 'low' = 'high'

  if (!trip.start_time || !trip.end_time) {
    issues.push('Missing start_time or end_time')
    confidence -= 0.3
    dataQuality = 'low'
  }

  if (trip.start_time && trip.end_time) {
    const startTime = new Date(trip.start_time)
    const endTime = new Date(trip.end_time)
    if (endTime <= startTime) {
      issues.push('end_time is before or equal to start_time')
      confidence -= 0.2
      dataQuality = dataQuality === 'high' ? 'medium' : 'low'
    }
  }

  const hasStartCoords = trip.start_latitude && trip.start_longitude
  const hasEndCoords = trip.end_latitude && trip.end_longitude
  
  if (!hasStartCoords || !hasEndCoords) {
    issues.push('Missing start or end coordinates')
    confidence -= 0.2
    if (dataQuality === 'high') dataQuality = 'medium'
  } else {
    if (Math.abs(trip.start_latitude!) > 90 || Math.abs(trip.start_longitude!) > 180) {
      issues.push('Invalid start coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
    if (Math.abs(trip.end_latitude!) > 90 || Math.abs(trip.end_longitude!) > 180) {
      issues.push('Invalid end coordinates')
      confidence -= 0.3
      dataQuality = 'low'
    }
  }

  if (trip.distance_km !== null && trip.distance_km !== undefined) {
    if (trip.distance_km < 0) {
      issues.push('Negative distance')
      confidence -= 0.2
    }
    
    if (hasStartCoords && hasEndCoords && trip.start_latitude && trip.start_longitude && trip.end_latitude && trip.end_longitude) {
      const calculatedDistance = haversineDistanceValidator(
        trip.start_latitude,
        trip.start_longitude,
        trip.end_latitude,
        trip.end_longitude
      )
      const reportedDistance = trip.distance_km || 0
      const distanceDiff = Math.abs(calculatedDistance - reportedDistance)
      
      if (distanceDiff > reportedDistance * 0.2 && reportedDistance > 0.1) {
        issues.push(`Distance mismatch: reported ${reportedDistance.toFixed(2)}km, calculated ${calculatedDistance.toFixed(2)}km`)
        confidence -= 0.1
        if (dataQuality === 'high') dataQuality = 'medium'
      }
    }
  } else {
    issues.push('Missing distance_km')
    confidence -= 0.1
  }

  return {
    ...trip,
    dataQuality,
    validationIssues: issues,
    confidence: Math.max(0, Math.min(1, confidence))
  }
}

// ============================================================================
// Tools
// ============================================================================

const get_vehicle_status: ToolDefinition = {
  name: 'get_vehicle_status',
  description: 'Get the current real-time location, speed, and status (online/offline) of the vehicle. ALWAYS call this tool immediately when asked about location, status, or "where are you".',
  parameters: {
    type: 'object',
    properties: {
      check_freshness: { type: 'boolean', description: 'Set to true to validate data freshness', default: true }
    },
    required: []
  },
  execute: async (_args, { supabase, device_id }) => {
    // Correct source: vehicle_positions (Real-time cache)
    // Note: 'address' column does not exist in vehicle_positions, so we only fetch coordinates.
    const { data: positions, error } = await supabase
      .from('vehicle_positions')
      .select('latitude, longitude, speed, heading, gps_time, is_online, ignition_on, battery_percent, total_mileage')
      .eq('device_id', device_id)
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Database error: ${error.message}`)
    if (!positions) return { status: 'unknown', message: 'No location data found.' }

    const timeAgoMinutes = Math.round((Date.now() - new Date(positions.gps_time).getTime()) / 60000)
    
    return {
      status: positions.is_online ? 'online' : 'offline',
      last_updated_minutes_ago: timeAgoMinutes,
      data_quality: timeAgoMinutes > 15 ? 'stale' : 'fresh',
      location: {
        address: "Address not available (use map)",
        coordinates: { lat: positions.latitude, lng: positions.longitude }
      },
      telemetry: {
        speed_kmh: Math.round(positions.speed),
        ignition: positions.ignition_on ? 'on' : 'off',
        heading: positions.heading,
        battery_percent: positions.battery_percent,
        odometer_km: Math.round(positions.total_mileage)
      }
    }
  }
}

const get_trip_history: ToolDefinition = {
  name: 'get_trip_history',
  description: 'Get historical trips for the vehicle. Trips are aggregated from ignition on/off events.',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date string for start of period' },
      end_date: { type: 'string', description: 'ISO date string for end of period' }
    },
    required: ['start_date', 'end_date']
  },
  execute: async ({ start_date, end_date }, { supabase, device_id }) => {
    // Correct source: vehicle_trips view with gps51 source
    const { data: trips, error } = await supabase
      .from('vehicle_trips')
      .select('*')
      .eq('device_id', device_id)
      .eq('source', 'gps51') // Critical filter for data parity
      .gte('start_time', start_date)
      .lte('end_time', end_date)
      .order('start_time', { ascending: true })
      .limit(50)

    if (error) throw new Error(`Database error: ${error.message}`)
    
    const validatedTrips = trips?.map((t: any, i: number) => validateTrip(t, i, trips)) || []
    
    const summary = {
      count: validatedTrips.length,
      total_distance_km: validatedTrips.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0),
      total_duration_hours: validatedTrips.reduce((sum: number, t: any) => sum + (t.duration_seconds || 0), 0) / 3600
    }

    return {
      summary,
      trips: validatedTrips.map((t: any) => ({
        start: t.start_time,
        end: t.end_time,
        from: t.start_address || t.start_location_name,
        to: t.end_address || t.end_location_name,
        distance_km: t.distance_km,
        duration_min: Math.round((t.duration_seconds || 0) / 60),
        quality: t.dataQuality
      }))
    }
  }
}

const search_trip_locations: ToolDefinition = {
  name: 'search_trip_locations',
  description: 'Search for trips to or from a specific location name (fuzzy search).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Location name to search for (e.g., "Airport", "Home", "Lagos")' }
    },
    required: ['query']
  },
  execute: async ({ query }, { supabase, device_id }) => {
    return await handleTripSearch(supabase, query, device_id)
  }
}

const request_vehicle_command: ToolDefinition = {
  name: 'request_vehicle_command',
  description: 'Request a command to control the vehicle (lock, unlock, immobilize, mobilize).',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', enum: ['lock_door', 'unlock_door', 'immobilize_engine', 'mobilize_engine', 'start_engine', 'stop_engine'] },
      reason: { type: 'string', description: 'Reason for the command' }
    },
    required: ['command']
  },
  execute: async ({ command, reason }, _) => {
    // We don't execute high-risk commands directly from the agent for safety.
    // We return a structured response that the UI can use to show a confirmation dialog.
    return {
      action: 'confirmation_required',
      command_type: command,
      reason: reason,
      message: `I have prepared the command to ${command.replace('_', ' ')}. Please confirm in the dashboard to execute.`
    }
  }
}

const search_knowledge_base: ToolDefinition = {
  name: 'search_knowledge_base',
  description: 'Search the vehicle manual, SOPs, and troubleshooting guides for answers to "how-to" or technical questions.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query (e.g., "how to change tire", "error code P0300")' }
    },
    required: ['query']
  },
  execute: async ({ query }, { supabase, device_id }) => {
    // Generate embedding for the query using Lovable/OpenAI (via pg_vector if available, or just simple text search)
    // Since we can't easily generate embeddings in this edge function without an API key,
    // we'll assume the database has a function `match_vehicle_documents` that handles the embedding generation 
    // OR we use a simple text search fallback if embeddings aren't set up.
    
    // Ideally: 
    // 1. Call OpenAI to get embedding for `query`
    // 2. Call `match_vehicle_documents` with embedding
    
    // For now, we will use a text search fallback if no embedding service is connected,
    // or rely on the `match_vehicle_documents` to handle it if it wraps an extension.
    
    // CHECK: Does `match_vehicle_documents` take text or vector?
    // Migration 20260201220000 says it takes `query_embedding vector(1536)`.
    // We need to generate that embedding.
    
    try {
      // We'll use the `lovable-ai` module to generate embedding if possible, 
      // but `callLovableAPI` is chat-only.
      // Let's fallback to a keyword search if we can't generate embeddings, 
      // OR assume the user has configured `pg_net` or similar to generate it.
      
      // ALTERNATIVE: Use a simple text search on the `content` column for now.
      const { data, error } = await supabase
        .from('vehicle_documents')
        .select('content, metadata')
        .textSearch('content', query, { type: 'websearch', config: 'english' })
        .limit(3);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          found: false,
          message: "I couldn't find any specific information in the manual about that."
        };
      }

      return {
        found: true,
        results: data.map(d => ({
          content: d.content,
          source: d.metadata?.source || 'Manual'
        }))
      };
    } catch (err: any) {
      console.error('Knowledge base search failed:', err);
      return { error: 'Failed to search knowledge base' };
    }
  }
}

const create_geofence_alert: ToolDefinition = {
  name: 'create_geofence_alert',
  description: 'Create a temporary geofence alert to notify when vehicle enters or leaves a location.',
  parameters: {
    type: 'object',
    properties: {
      location_name: { type: 'string', description: 'Name of location (e.g., "Airport", "Garki")' },
      trigger_on: { type: 'string', enum: ['enter', 'exit', 'both'], default: 'enter' },
      action: { type: 'string', enum: ['notify', 'immobilize'], default: 'notify' }
    },
    required: ['location_name']
  },
  execute: async ({ location_name, trigger_on, action }, { supabase, device_id }) => {
    // 1. Resolve Location Name to Coordinates/Polygon
    const { data: locations, error: searchError } = await supabase.rpc('search_locations_fuzzy', {
      search_query: location_name,
      limit_count: 1
    })

    if (searchError) throw new Error(`Location search failed: ${searchError.message}`)
    if (!locations || locations.length === 0) {
      return { 
        status: 'error', 
        message: `I couldn't find a location named "${location_name}". Please be more specific or check the spelling.` 
      }
    }

    const targetLocation = locations[0] // Assuming match_text, match_type, etc.

    // 2. Create Monitor Entry in DB
    const activeUntil = new Date()
    activeUntil.setHours(activeUntil.getHours() + 24) // Default 24h monitoring

    // Schema Correction: 
    // - Use 'device_id' instead of 'vehicle_id'
    // - Use 'expires_at' for expiration timestamp (active_until is TIME type)
    // - Remove 'name' and 'action' (not in schema)
    // - Store 'action' intent in a separate event log or assume default notification
    
    const { error: insertError } = await supabase
      .from('geofence_monitors')
      .insert({
        device_id: device_id, // Correct column name
        location_name: targetLocation.match_text,
        latitude: targetLocation.latitude || targetLocation.lat, // Handle both potential formats from search
        longitude: targetLocation.longitude || targetLocation.lon,
        radius_meters: 500,
        trigger_on: trigger_on,
        is_active: true,
        expires_at: activeUntil.toISOString()
      })

    if (insertError) {
      // Fallback: Just log it as a proactive event request
      console.warn('Failed to create monitor, logging as event request', insertError)
      await supabase.from('proactive_vehicle_events').insert({
        device_id: device_id,
        event_type: 'geofence_enter', // Placeholder
        severity: 'info',
        title: `Geofence Alert Request: ${location_name}`,
        description: `User requested alert when vehicle ${trigger_on}s ${location_name}. (Monitor creation failed: ${insertError.message})`,
        metadata: { target_location: targetLocation, action }
      })
      
      return {
        status: 'partial_success',
        message: `I couldn't create a live monitor (System Error), but I've logged your request.`,
        error: insertError.message
      }
    }

    // If user wanted 'immobilize', we log a warning event because monitors are currently notify-only
    if (action === 'immobilize') {
       await supabase.from('proactive_vehicle_events').insert({
        device_id: device_id,
        event_type: 'security_alert',
        severity: 'warning',
        title: 'Immobilize on Geofence Requested',
        description: `User requested immobilization on ${trigger_on} ${location_name}. This requires manual verification.`,
        metadata: { target_location: targetLocation }
      })
    }

    return {
      status: 'success',
      message: `I've set up an alert. I'll notify you when the vehicle ${trigger_on}s ${targetLocation.match_text}.` + (action === 'immobilize' ? " (Note: Automatic immobilization is not yet enabled for safety; I will send a high-priority alert instead.)" : ""),
      monitor_details: {
        location: targetLocation.match_text,
        trigger: trigger_on,
        expires_at: activeUntil.toISOString()
      }
    }
  }
}

export const TOOLS: ToolDefinition[] = [
  get_vehicle_status,
  get_trip_history,
  search_trip_locations,
  request_vehicle_command,
  create_geofence_alert
]

export const TOOLS_SCHEMA = TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters
})) // OpenAI/Gemini format
