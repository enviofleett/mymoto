import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
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

    // Reverse geocode trips that have coordinates but no addresses
    // Limit to first 10 trips to avoid excessive API calls
    const tripsWithAddresses = await Promise.all(
      validatedTrips.slice(0, 10).map(async (t: any) => {
        let fromAddr = t.start_address || t.start_location_name
        let toAddr = t.end_address || t.end_location_name

        // Geocode start if missing but coordinates exist
        if (!fromAddr && t.start_latitude && t.start_longitude &&
            t.start_latitude !== 0 && t.start_longitude !== 0) {
          try {
            const geo = await reverseGeocode(t.start_latitude, t.start_longitude)
            fromAddr = geo.address
          } catch { /* non-blocking */ }
        }

        // Geocode end if missing but coordinates exist
        if (!toAddr && t.end_latitude && t.end_longitude &&
            t.end_latitude !== 0 && t.end_longitude !== 0) {
          try {
            const geo = await reverseGeocode(t.end_latitude, t.end_longitude)
            toAddr = geo.address
          } catch { /* non-blocking */ }
        }

        return {
          start: t.start_time,
          end: t.end_time,
          from: fromAddr || 'Unknown location',
          to: toAddr || 'Unknown location',
          distance_km: t.distance_km,
          duration_min: Math.round((t.duration_seconds || 0) / 60),
          max_speed_kmh: t.max_speed ? Math.round(t.max_speed) : null,
          avg_speed_kmh: t.avg_speed ? Math.round(t.avg_speed) : null,
          quality: t.dataQuality
        }
      })
    )

    // Append remaining trips without geocoding (index 10+)
    const remainingTrips = validatedTrips.slice(10).map((t: any) => ({
      start: t.start_time,
      end: t.end_time,
      from: t.start_address || t.start_location_name || 'Unknown location',
      to: t.end_address || t.end_location_name || 'Unknown location',
      distance_km: t.distance_km,
      duration_min: Math.round((t.duration_seconds || 0) / 60),
      max_speed_kmh: t.max_speed ? Math.round(t.max_speed) : null,
      avg_speed_kmh: t.avg_speed ? Math.round(t.avg_speed) : null,
      quality: t.dataQuality
    }))

    return {
      summary,
      trips: [...tripsWithAddresses, ...remainingTrips]
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

// ============================================================================
// NEW: Trip Analytics Tool
// ============================================================================

const get_trip_analytics: ToolDefinition = {
  name: 'get_trip_analytics',
  description: 'Get comprehensive trip analytics including trip count, total drive time, parking duration, distance covered, and daily breakdown. Use this for questions like "How many trips today?", "How long was I driving?", "What are my stats for this week?"',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date string for start of period (e.g., "2024-01-15")' },
      end_date: { type: 'string', description: 'ISO date string for end of period (e.g., "2024-01-15")' },
      period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'custom'], description: 'Predefined period or custom range' }
    },
    required: []
  },
  execute: async ({ start_date, end_date, period = 'today' }, { supabase, device_id }) => {
    // Calculate date range based on period
    const now = new Date()
    let startDate: Date
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        break
      case 'yesterday':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59)
        break
      case 'this_week':
        const dayOfWeek = now.getDay()
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0)
        break
      case 'last_week':
        const lastWeekDay = now.getDay()
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - lastWeekDay - 7, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - lastWeekDay - 1, 23, 59, 59)
        break
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
        break
      case 'custom':
        startDate = start_date ? new Date(start_date) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        endDate = end_date ? new Date(end_date) : endDate
        break
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    }

    // Query vehicle_daily_stats view for aggregated data
    const { data: dailyStats, error: statsError } = await supabase
      .from('vehicle_daily_stats')
      .select('*')
      .eq('device_id', device_id)
      .gte('stat_date', startDate.toISOString().split('T')[0])
      .lte('stat_date', endDate.toISOString().split('T')[0])
      .order('stat_date', { ascending: false })

    if (statsError) {
      console.error('Error fetching daily stats:', statsError)
    }

    // Query trips for more detailed analysis
    const { data: trips, error: tripsError } = await supabase
      .from('vehicle_trips')
      .select('start_time, end_time, duration_seconds, distance_km, start_address, end_address, start_latitude, start_longitude, end_latitude, end_longitude')
      .eq('device_id', device_id)
      .gte('start_time', startDate.toISOString())
      .lte('end_time', endDate.toISOString())
      .order('start_time', { ascending: true })

    if (tripsError) throw new Error(`Database error: ${tripsError.message}`)

    // Calculate analytics
    const tripCount = trips?.length || 0
    const totalDriveTimeSeconds = trips?.reduce((sum: number, t: any) => sum + (t.duration_seconds || 0), 0) || 0
    const totalDistanceKm = trips?.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0) || 0

    // Calculate time between trips (parking/idle time)
    let totalParkingTimeSeconds = 0
    if (trips && trips.length > 1) {
      for (let i = 1; i < trips.length; i++) {
        const prevEnd = new Date(trips[i - 1].end_time).getTime()
        const currStart = new Date(trips[i].start_time).getTime()
        const gapSeconds = (currStart - prevEnd) / 1000
        // Only count gaps less than 12 hours as parking (otherwise might be overnight)
        if (gapSeconds > 0 && gapSeconds < 12 * 3600) {
          totalParkingTimeSeconds += gapSeconds
        }
      }
    }

    // Format durations
    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      if (hours > 0) {
        return `${hours}h ${minutes}m`
      }
      return `${minutes} minutes`
    }

    // Get first and last trip locations for summary
    const firstTrip = trips?.[0]
    const lastTrip = trips?.[trips.length - 1]

    return {
      period: {
        name: period,
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        total_trips: tripCount,
        total_distance_km: Math.round(totalDistanceKm * 100) / 100,
        total_drive_time: formatDuration(totalDriveTimeSeconds),
        total_drive_time_seconds: totalDriveTimeSeconds,
        total_parking_time: formatDuration(totalParkingTimeSeconds),
        total_parking_time_seconds: totalParkingTimeSeconds,
        average_trip_distance_km: tripCount > 0 ? Math.round((totalDistanceKm / tripCount) * 100) / 100 : 0,
        average_trip_duration: tripCount > 0 ? formatDuration(totalDriveTimeSeconds / tripCount) : '0 minutes'
      },
      daily_breakdown: dailyStats?.map((d: any) => ({
        date: d.stat_date,
        trips: d.trip_count,
        distance_km: d.total_distance_km,
        drive_time: formatDuration(d.total_duration_seconds),
        peak_speed_kmh: d.peak_speed,
        avg_speed_kmh: d.avg_speed
      })) || [],
      first_trip: firstTrip ? {
        time: firstTrip.start_time,
        from: firstTrip.start_address || 'Unknown'
      } : null,
      last_trip: lastTrip ? {
        time: lastTrip.end_time,
        to: lastTrip.end_address || 'Unknown'
      } : null
    }
  }
}

// ============================================================================
// NEW: Favorite Locations Tool
// ============================================================================

const get_favorite_locations: ToolDefinition = {
  name: 'get_favorite_locations',
  description: 'Get the most frequently visited parking spots and locations. Analyzes trip end points to identify favorite/common destinations. Use for questions like "Where do I usually park?", "What are my favorite spots?", "Where do I go most often?"',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Number of days to analyze (default: 30, max: 90)' },
      limit: { type: 'number', description: 'Number of top locations to return (default: 5, max: 10)' }
    },
    required: []
  },
  execute: async ({ days = 30, limit = 5 }, { supabase, device_id }) => {
    const maxDays = Math.min(days || 30, 90)
    const maxLimit = Math.min(limit || 5, 10)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - maxDays)

    // Get all trip end points (parking locations)
    const { data: trips, error } = await supabase
      .from('vehicle_trips')
      .select('end_latitude, end_longitude, end_address, end_time')
      .eq('device_id', device_id)
      .gte('start_time', startDate.toISOString())
      .not('end_latitude', 'is', null)
      .not('end_longitude', 'is', null)
      .order('end_time', { ascending: false })

    if (error) throw new Error(`Database error: ${error.message}`)
    if (!trips || trips.length === 0) {
      return {
        found: false,
        message: `No trip data found in the last ${maxDays} days to analyze parking patterns.`
      }
    }

    // Cluster nearby locations (within ~100m radius)
    const CLUSTER_RADIUS_KM = 0.1 // 100 meters
    const clusters: Array<{
      lat: number
      lng: number
      count: number
      addresses: string[]
      lastVisit: string
    }> = []

    for (const trip of trips) {
      const lat = trip.end_latitude
      const lng = trip.end_longitude

      // Find existing cluster within radius
      let foundCluster = false
      for (const cluster of clusters) {
        const R = 6371 // Earth radius in km
        const dLat = ((lat - cluster.lat) * Math.PI) / 180
        const dLon = ((lng - cluster.lng) * Math.PI) / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos((cluster.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        const distance = R * c

        if (distance <= CLUSTER_RADIUS_KM) {
          cluster.count++
          if (trip.end_address && !cluster.addresses.includes(trip.end_address)) {
            cluster.addresses.push(trip.end_address)
          }
          if (trip.end_time > cluster.lastVisit) {
            cluster.lastVisit = trip.end_time
          }
          foundCluster = true
          break
        }
      }

      if (!foundCluster) {
        clusters.push({
          lat,
          lng,
          count: 1,
          addresses: trip.end_address ? [trip.end_address] : [],
          lastVisit: trip.end_time
        })
      }
    }

    // Sort by visit count and take top locations
    clusters.sort((a, b) => b.count - a.count)
    const topLocations = clusters.slice(0, maxLimit)

    // Reverse geocode locations without addresses
    const locationsWithAddresses = await Promise.all(
      topLocations.map(async (loc, index) => {
        let address = loc.addresses[0]
        if (!address) {
          const geocoded = await reverseGeocode(loc.lat, loc.lng)
          address = geocoded.address
        }
        return {
          rank: index + 1,
          address: address,
          visit_count: loc.count,
          last_visited: loc.lastVisit,
          coordinates: { lat: loc.lat, lng: loc.lng },
          map_link: `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
        }
      })
    )

    return {
      found: true,
      analysis_period_days: maxDays,
      total_trips_analyzed: trips.length,
      favorite_locations: locationsWithAddresses
    }
  }
}

export const TOOLS: ToolDefinition[] = [
  get_vehicle_status,
  get_trip_history,
  get_trip_analytics,      // NEW: Comprehensive trip analytics
  get_favorite_locations,  // NEW: Frequently visited spots
  get_position_history,
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
