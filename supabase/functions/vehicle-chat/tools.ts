import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleTripSearch } from './trip-search.ts'
import { validateTrip } from './trip-utils.ts'
import { reverseGeocode } from '../_shared/geocoding.ts'

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
    const { data: positions, error } = await supabase
      .from('vehicle_positions')
      .select('latitude, longitude, speed, heading, gps_time, is_online, ignition_on, battery_percent, total_mileage')
      .eq('device_id', device_id)
      .limit(1)
      .maybeSingle()

    if (error) throw new Error(`Database error: ${error.message}`)
    if (!positions) return { status: 'unknown', message: 'No location data found.' }

    const timeAgoMinutes = Math.round((Date.now() - new Date(positions.gps_time).getTime()) / 60000)

    // Reverse geocode to get address and map links
    const geocodeResult = await reverseGeocode(positions.latitude, positions.longitude)

    return {
      status: positions.is_online ? 'online' : 'offline',
      last_updated_minutes_ago: timeAgoMinutes,
      data_quality: timeAgoMinutes > 15 ? 'stale' : 'fresh',
      location: {
        address: geocodeResult.address,
        map_link: geocodeResult.mapUrl,
        static_map: geocodeResult.staticMapUrl,
        coordinates: geocodeResult.coordinates
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
    // Correct source: vehicle_trips view - allow all valid sources
    const { data: trips, error } = await supabase
      .from('vehicle_trips')
      .select('*')
      .eq('device_id', device_id)
      // .eq('source', 'gps51') // Removed strict source filter to include position_history and legacy trips
      .gte('start_time', start_date)
      .lte('end_time', end_date)
      .order('start_time', { ascending: true })
      .limit(50)

    if (error) throw new Error(`Database error: ${error.message}`)
    
    const validatedTrips = trips
      ?.map((t: any) => validateTrip(t))
      .filter((t: any) => !t.isGhost) || []
    
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

const get_position_history: ToolDefinition = {
  name: 'get_position_history',
  description: 'Get detailed GPS position history for the vehicle. Use this to see where the vehicle was at a specific time, track movement patterns, or analyze driving behavior. Returns coordinates, speed, and ignition status at each recorded point.',
  parameters: {
    type: 'object',
    properties: {
      start_time: { type: 'string', description: 'ISO date string for start of period (e.g., "2024-01-15T09:00:00Z")' },
      end_time: { type: 'string', description: 'ISO date string for end of period (e.g., "2024-01-15T17:00:00Z")' },
      limit: { type: 'number', description: 'Maximum number of positions to return (default: 100, max: 500)' }
    },
    required: ['start_time', 'end_time']
  },
  execute: async ({ start_time, end_time, limit = 100 }, { supabase, device_id }) => {
    // Validate and cap limit
    const maxLimit = Math.min(limit || 100, 500)

    // Query position_history table for raw GPS data
    const { data: positions, error } = await supabase
      .from('position_history')
      .select('latitude, longitude, speed, heading, ignition_on, ignition_confidence, gps_time, battery_percent')
      .eq('device_id', device_id)
      .gte('gps_time', start_time)
      .lte('gps_time', end_time)
      .order('gps_time', { ascending: true })
      .limit(maxLimit)

    if (error) throw new Error(`Database error: ${error.message}`)
    if (!positions || positions.length === 0) {
      return {
        found: false,
        message: `No GPS position records found between ${start_time} and ${end_time}. The vehicle may have been offline or not moving during this period.`
      }
    }

    // Calculate summary statistics
    const speedsAboveZero = positions.filter((p: any) => p.speed > 0).map((p: any) => p.speed)
    const ignitionOnCount = positions.filter((p: any) => p.ignition_on === true).length

    // Calculate approximate distance traveled (sum of segments)
    let totalDistanceKm = 0
    for (let i = 1; i < positions.length; i++) {
      const p1 = positions[i - 1]
      const p2 = positions[i]
      if (p1.latitude && p1.longitude && p2.latitude && p2.longitude) {
        // Haversine distance calculation
        const R = 6371 // Earth radius in km
        const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180
        const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos((p1.latitude * Math.PI) / 180) * Math.cos((p2.latitude * Math.PI) / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const dist = R * c
        // Filter out GPS jumps (> 10km between consecutive points)
        if (dist < 10) totalDistanceKm += dist
      }
    }

    const summary = {
      total_positions: positions.length,
      time_range: {
        start: positions[0].gps_time,
        end: positions[positions.length - 1].gps_time
      },
      movement: {
        approximate_distance_km: Math.round(totalDistanceKm * 100) / 100,
        max_speed_kmh: speedsAboveZero.length > 0 ? Math.max(...speedsAboveZero) : 0,
        avg_speed_kmh: speedsAboveZero.length > 0
          ? Math.round((speedsAboveZero.reduce((a: number, b: number) => a + b, 0) / speedsAboveZero.length) * 10) / 10
          : 0,
        ignition_on_percent: Math.round((ignitionOnCount / positions.length) * 100)
      },
      start_position: {
        coordinates: { lat: positions[0].latitude, lng: positions[0].longitude },
        time: positions[0].gps_time,
        speed_kmh: Math.round(positions[0].speed || 0),
        ignition: positions[0].ignition_on ? 'on' : 'off'
      },
      end_position: {
        coordinates: { lat: positions[positions.length - 1].latitude, lng: positions[positions.length - 1].longitude },
        time: positions[positions.length - 1].gps_time,
        speed_kmh: Math.round(positions[positions.length - 1].speed || 0),
        ignition: positions[positions.length - 1].ignition_on ? 'on' : 'off'
      }
    }

    // Return positions with simplified format
    const positionData = positions.map((p: any) => ({
      time: p.gps_time,
      lat: p.latitude,
      lng: p.longitude,
      speed_kmh: Math.round(p.speed || 0),
      heading: p.heading,
      ignition: p.ignition_on ? 'on' : 'off',
      battery: p.battery_percent
    }))

    return {
      found: true,
      summary,
      positions: positionData
    }
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
        results: data.map((d: any) => ({
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
  get_position_history,  // NEW: Detailed GPS position history for tracking
  search_trip_locations,
  request_vehicle_command,
  search_knowledge_base,
  create_geofence_alert
]

// OpenAI/OpenRouter compatible format - tools must be wrapped with type: "function"
export const TOOLS_SCHEMA = TOOLS.map(t => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }
}))
