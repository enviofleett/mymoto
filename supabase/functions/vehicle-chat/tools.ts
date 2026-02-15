import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { handleTripSearch } from './trip-search.ts'
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
    
    // Determine data quality level
    let dataQuality = 'fresh';
    let warningMessage = undefined;
    
    if (timeAgoMinutes > 1440) { // > 24 hours
        dataQuality = 'historical';
        warningMessage = `CRITICAL: Data is ${Math.round(timeAgoMinutes/60)} hours old. The vehicle is offline or tracking is disabled. Do not report this as current movement.`;
    } else if (timeAgoMinutes > 15) {
        dataQuality = 'stale';
    }

    // Reverse geocode to get address and map links
    const geocodeResult = await reverseGeocode(positions.latitude, positions.longitude)

    return {
      status: positions.is_online ? 'online' : 'offline',
      last_updated_minutes_ago: timeAgoMinutes,
      data_quality: dataQuality,
      warning: warningMessage,
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
  description: 'Get historical trips for the vehicle from GPS51 raw trips (gps51_trips). This matches the Owner PWA reports 1:1 (no filtering).',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date string for start of period' },
      end_date: { type: 'string', description: 'ISO date string for end of period' }
    },
    required: ['start_date', 'end_date']
  },
  execute: async ({ start_date, end_date }, { supabase, device_id }) => {
    // Source of truth: gps51_trips (raw querytrips sync table).
    // Date inclusion uses start_time boundaries (aligned with Owner PWA reports).
    const { data: trips, error } = await supabase
      .from('gps51_trips')
      .select('id, device_id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_meters, avg_speed_kmh, max_speed_kmh, duration_seconds')
      .eq('device_id', device_id)
      .gte('start_time', start_date)
      .lte('start_time', end_date)
      .order('start_time', { ascending: true })
      .limit(50)

    if (error) throw new Error(`Database error: ${error.message}`)

    const mapTrip = (t: any) => {
      const distanceKm = t.distance_meters == null ? null : Number(t.distance_meters) / 1000
      const qualityFlags: string[] = []
      const hasStart = t.start_latitude != null && t.start_longitude != null && t.start_latitude !== 0 && t.start_longitude !== 0
      const hasEnd = t.end_latitude != null && t.end_longitude != null && t.end_latitude !== 0 && t.end_longitude !== 0
      if (!t.end_time) qualityFlags.push('missing_end_time')
      if (!hasStart) qualityFlags.push('missing_start_coordinates')
      if (!hasEnd) qualityFlags.push('missing_end_coordinates')
      if (distanceKm == null) qualityFlags.push('missing_distance')
      return {
        id: t.id,
        start_time: t.start_time,
        end_time: t.end_time,
        start_latitude: t.start_latitude,
        start_longitude: t.start_longitude,
        end_latitude: t.end_latitude,
        end_longitude: t.end_longitude,
        distance_km: distanceKm,
        duration_seconds: t.duration_seconds ?? null,
        max_speed_kmh: t.max_speed_kmh == null ? null : Math.round(Number(t.max_speed_kmh)),
        avg_speed_kmh: t.avg_speed_kmh == null ? null : Math.round(Number(t.avg_speed_kmh)),
        quality_flags: qualityFlags
      }
    }

    const mappedTrips = (trips || []).map(mapTrip)

    const summary = {
      count: mappedTrips.length,
      total_distance_km: mappedTrips.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0),
      total_duration_hours: mappedTrips.reduce((sum: number, t: any) => sum + (t.duration_seconds || 0), 0) / 3600
    }

    const formatCoords = (lat?: number | null, lon?: number | null) => {
      if (lat == null || lon == null) return null
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`
    }

    // Reverse geocode first 10 trips where we have coordinates.
    const tripsWithAddresses = await Promise.all(
      mappedTrips.slice(0, 10).map(async (t: any) => {
        let fromAddr: string | null = null
        let toAddr: string | null = null

        if (t.start_latitude != null && t.start_longitude != null && t.start_latitude !== 0 && t.start_longitude !== 0) {
          try {
            const geo = await reverseGeocode(t.start_latitude, t.start_longitude)
            fromAddr = geo.address
          } catch { /* non-blocking */ }
        }
        if (t.end_latitude != null && t.end_longitude != null && t.end_latitude !== 0 && t.end_longitude !== 0) {
          try {
            const geo = await reverseGeocode(t.end_latitude, t.end_longitude)
            toAddr = geo.address
          } catch { /* non-blocking */ }
        }

        return {
          start: t.start_time,
          end: t.end_time,
          from: fromAddr || formatCoords(t.start_latitude, t.start_longitude) || 'Unknown location',
          to: toAddr || formatCoords(t.end_latitude, t.end_longitude) || 'Unknown location',
          distance_km: t.distance_km,
          duration_min: t.duration_seconds == null ? null : Math.round(Number(t.duration_seconds) / 60),
          max_speed_kmh: t.max_speed_kmh,
          avg_speed_kmh: t.avg_speed_kmh,
          quality_flags: t.quality_flags
        }
      })
    )

    const remainingTrips = mappedTrips.slice(10).map((t: any) => ({
      start: t.start_time,
      end: t.end_time,
      from: formatCoords(t.start_latitude, t.start_longitude) || 'Unknown location',
      to: formatCoords(t.end_latitude, t.end_longitude) || 'Unknown location',
      distance_km: t.distance_km,
      duration_min: t.duration_seconds == null ? null : Math.round(Number(t.duration_seconds) / 60),
      max_speed_kmh: t.max_speed_kmh,
      avg_speed_kmh: t.avg_speed_kmh,
      quality_flags: t.quality_flags
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

    // Source of truth: gps51_trips (raw GPS51 trips).
    // Query by start_time bounds so trips with null end_time aren't dropped.
    const { data: trips, error: tripsError } = await supabase
      .from('gps51_trips')
      .select('start_time, end_time, duration_seconds, distance_meters, avg_speed_kmh, max_speed_kmh')
      .eq('device_id', device_id)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true })

    if (tripsError) throw new Error(`Database error: ${tripsError.message}`)

    // Calculate analytics
    const tripCount = trips?.length || 0
    const totalDriveTimeSeconds =
      trips?.reduce((sum: number, t: any) => sum + (t.duration_seconds || 0), 0) || 0
    const totalDistanceKm =
      trips?.reduce((sum: number, t: any) => sum + ((t.distance_meters || 0) / 1000), 0) || 0

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

    // Build a simple daily breakdown (UTC day boundaries; caller timezone normalization is handled upstream).
    const dailyAgg: Record<string, { trip_count: number; total_distance_km: number; total_duration_seconds: number; peak_speed: number | null; avg_speed_sum: number; avg_speed_count: number }> = {}
    for (const t of trips || []) {
      const day = String(t.start_time).slice(0, 10)
      if (!dailyAgg[day]) {
        dailyAgg[day] = { trip_count: 0, total_distance_km: 0, total_duration_seconds: 0, peak_speed: null, avg_speed_sum: 0, avg_speed_count: 0 }
      }
      const d = dailyAgg[day]
      d.trip_count += 1
      d.total_distance_km += (t.distance_meters || 0) / 1000
      d.total_duration_seconds += (t.duration_seconds || 0)
      const peak = t.max_speed_kmh == null ? null : Number(t.max_speed_kmh)
      if (peak != null && (d.peak_speed == null || peak > d.peak_speed)) d.peak_speed = peak
      const avg = t.avg_speed_kmh == null ? null : Number(t.avg_speed_kmh)
      if (avg != null && Number.isFinite(avg)) {
        d.avg_speed_sum += avg
        d.avg_speed_count += 1
      }
    }
    const daily_breakdown = Object.entries(dailyAgg)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, d]) => ({
        date,
        trips: d.trip_count,
        distance_km: Math.round(d.total_distance_km * 100) / 100,
        drive_time: formatDuration(d.total_duration_seconds),
        peak_speed_kmh: d.peak_speed == null ? null : Math.round(d.peak_speed),
        avg_speed_kmh: d.avg_speed_count > 0 ? Math.round((d.avg_speed_sum / d.avg_speed_count) * 10) / 10 : null
      }))

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
      daily_breakdown,
      first_trip: trips && trips.length > 0 ? { time: trips[0].start_time } : null,
      last_trip: trips && trips.length > 0 ? { time: trips[trips.length - 1].end_time ?? trips[trips.length - 1].start_time } : null
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

    // Source of truth: gps51_trips. Addresses are derived via reverse geocoding.
    const { data: trips, error } = await supabase
      .from('gps51_trips')
      .select('end_latitude, end_longitude, end_time')
      .eq('device_id', device_id)
      .gte('start_time', startDate.toISOString())
      .not('end_latitude', 'is', null)
      .not('end_longitude', 'is', null)
      .neq('end_latitude', 0)
      .neq('end_longitude', 0)
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
          addresses: [],
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

const get_vehicle_health: ToolDefinition = {
  name: 'get_vehicle_health',
  description: 'Get the overall health status of the vehicle, including battery health, driving behavior score, connectivity score, and any active maintenance recommendations.',
  parameters: {
    type: 'object',
    properties: {
      check_freshness: { type: 'boolean', description: 'Set to true to validate data freshness', default: true }
    },
    required: []
  },
  execute: async (_args, { supabase, device_id }) => {
    // 1. Get Health Metrics (RPC)
    const { data: healthMetrics, error: healthError } = await supabase
      .rpc('get_vehicle_health', { p_device_id: device_id })
      .maybeSingle()
    
    if (healthError) {
        console.error('Error fetching health metrics:', healthError);
        // Continue, as we might still get recommendations
    }

    // 2. Get Active Recommendations
    const { data: recommendations, error: recError } = await supabase
      .from('maintenance_recommendations')
      .select('title, description, recommendation_type, priority, status')
      .eq('device_id', device_id)
      .eq('status', 'active')
      .limit(5)
    
    if (recError) {
        console.error('Error fetching recommendations:', recError);
    }

    // 3. Get latest battery from position
    const { data: position } = await supabase
      .from('vehicle_positions')
      .select('battery_percent, ignition_on')
      .eq('device_id', device_id)
      .maybeSingle()

    return {
      health_score: healthMetrics?.overall_health_score || 'N/A',
      battery: {
        level_percent: position?.battery_percent || 'Unknown',
        health_score: healthMetrics?.battery_health_score || 'N/A'
      },
      driving_score: healthMetrics?.driving_behavior_score || 'N/A',
      connectivity_score: healthMetrics?.connectivity_score || 'N/A',
      active_issues_count: recommendations?.length || 0,
      active_issues: recommendations?.map((r: any) => ({
        issue: r.title,
        detail: r.description,
        type: r.recommendation_type,
        priority: r.priority
      })) || [],
      summary: recommendations && recommendations.length > 0 
        ? `Vehicle has ${recommendations.length} active maintenance issue(s).` 
        : 'Vehicle appears to be in good health.'
    }
  }
}

const get_maintenance_updates: ToolDefinition = {
  name: 'get_maintenance_updates',
  description: 'Get a list of maintenance updates, recommendations, and vehicle health alerts.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'resolved', 'all'], default: 'active' },
      limit: { type: 'number', default: 5 }
    },
    required: []
  },
  execute: async ({ status = 'active', limit = 5 }, { supabase, device_id }) => {
    let query = supabase
      .from('maintenance_recommendations')
      .select('*')
      .eq('device_id', device_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: updates, error } = await query

    if (error) throw new Error(`Database error: ${error.message}`)

    if (!updates || updates.length === 0) {
      return {
        found: false,
        message: `No ${status} maintenance updates found.`
      }
    }

    return {
      found: true,
      count: updates.length,
      updates: updates.map((u: any) => ({
        id: u.id,
        title: u.title,
        description: u.description,
        type: u.recommendation_type,
        priority: u.priority,
        status: u.status,
        created_at: u.created_at,
        predicted_issue: u.predicted_issue
      }))
    }
  }
}

const get_fuel_stats: ToolDefinition = {
  name: 'get_fuel_stats',
  description: 'Get fuel consumption, efficiency, and theft/leak alerts. Use for questions like "What is my fuel efficiency?", "Did I lose any fuel?", "How much fuel did I use?"',
  parameters: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date string for start (default: 30 days ago)' },
      end_date: { type: 'string', description: 'ISO date string for end (default: now)' }
    },
    required: []
  },
  execute: async ({ start_date, end_date }, { supabase, device_id }) => {
    const now = new Date()
    const defaultStart = new Date()
    defaultStart.setDate(now.getDate() - 30)
    
    const start = start_date || defaultStart.toISOString().split('T')[0]
    const end = end_date || now.toISOString().split('T')[0]

    const { data: fuelData, error } = await supabase
      .from('vehicle_mileage_details')
      .select('*')
      .eq('device_id', device_id)
      .gte('statisticsday', start)
      .lte('statisticsday', end)
      .order('statisticsday', { ascending: false })

    if (error) throw new Error(`Database error: ${error.message}`)

    if (!fuelData || fuelData.length === 0) {
      return { found: false, message: 'No fuel data found for this period.' }
    }

    // 1. Fetch Vehicle Profile for Comparison
    const { data: vehicleProfile } = await supabase
      .from('vehicles')
      .select('make, model, year, official_fuel_efficiency_l_100km')
      .eq('device_id', device_id)
      .maybeSingle()

    // Aggregate stats
    const totalDistance = fuelData.reduce((sum: number, d: any) => sum + (d.totaldistance || 0), 0)
    const avgEfficiency = fuelData.reduce((sum: number, d: any) => sum + (d.oilper100km || 0), 0) / fuelData.length
    const totalLeaks = fuelData.reduce((sum: number, d: any) => sum + (d.leakoil || 0), 0)

    // Check for theft (leak > 0)
    const leaks = fuelData.filter((d: any) => d.leakoil > 0).map((d: any) => ({
      date: d.statisticsday,
      amount_liters: d.leakoil / 100 // Convert 1/100L to L
    }))

    // Calculate Comparison
    let comparison = null;
    let missingProfileData = false;
    // New top-level message field to guide the LLM
    let llmMessage = null;

    if (vehicleProfile?.official_fuel_efficiency_l_100km) {
        const rated = vehicleProfile.official_fuel_efficiency_l_100km;
        
        // Handle 0 efficiency case (no data yet)
        if (avgEfficiency <= 0) {
             comparison = {
                rated_l_100km: rated,
                status: 'no_data',
                message: `I have your rated efficiency (${rated} L/100km), but I haven't received enough driving data from the sensor yet to compare.`
             };
             llmMessage = "Fuel consumption data is not yet available from the sensor. Please tell the user that you have their rated efficiency but are waiting for real-world data.";
        } else {
            const diff = avgEfficiency - rated;
            const percentDiff = (diff / rated) * 100;
            
            comparison = {
                rated_l_100km: rated,
                difference_l_100km: Math.round(diff * 100) / 100,
                percent_difference: Math.round(percentDiff),
                status: diff > 0 ? 'inefficient' : 'efficient',
                message: diff > 0 
                    ? `You are consuming ${Math.round(percentDiff)}% more fuel than the manufacturer rating (${rated} L/100km).`
                    : `You are running efficiently! ${Math.abs(Math.round(percentDiff))}% better than rated.`
            };
        }
    } else {
        missingProfileData = true;
        if (avgEfficiency <= 0) {
            llmMessage = "No fuel consumption data is available yet, and the vehicle profile is missing efficiency ratings. Please ask the user for their vehicle Make, Model, and Year to establish a baseline.";
        }
    }

    return {
      found: true,
      period: { start, end },
      message: llmMessage, // Explicit instruction for LLM
      vehicle_info: vehicleProfile ? {
          make: vehicleProfile.make,
          model: vehicleProfile.model,
          year: vehicleProfile.year
      } : null,
      missing_rated_data: missingProfileData,
      comparison: comparison,
      summary: {
        avg_consumption_l_100km: avgEfficiency > 0 ? Math.round(avgEfficiency * 100) / 100 : null, // Return null if 0 to avoid "0 L/100km" text
        total_distance_meters: totalDistance,
        potential_theft_detected: totalLeaks > 0,
        total_leak_amount_liters: totalLeaks / 100
      },
      theft_alerts: leaks,
      daily_logs: fuelData.slice(0, 5).map((d: any) => ({
        date: d.statisticsday,
        efficiency: d.oilper100km,
        consumption_l_per_hour: d.oilperhour
      }))
    }
  }
}

const update_vehicle_profile: ToolDefinition = {
  name: 'update_vehicle_profile',
  description: 'Update vehicle profile details such as Make, Model, Year, Fuel Type, and Official Fuel Efficiency rating. IMPORTANT: If the user provides the vehicle Make/Model but NOT the efficiency, YOU MUST ESTIMATE the "official_fuel_efficiency" based on your general knowledge (e.g., ~8.0 for a sedan, ~12.0 for a truck) and include it in the call. Do not ask the user for it if you can estimate it.',
  parameters: {
    type: 'object',
    properties: {
      make: { type: 'string', description: 'Vehicle make (e.g., Toyota, Ford)' },
      model: { type: 'string', description: 'Vehicle model (e.g., Camry, Ranger)' },
      year: { type: 'number', description: 'Year of manufacture' },
      fuel_type: { type: 'string', description: 'Fuel type (e.g., petrol, diesel, hybrid)' },
      engine_displacement: { type: 'string', description: 'Engine size (e.g., 2.0L)' },
      official_fuel_efficiency: { type: 'number', description: 'Official rated fuel consumption in L/100km (Estimate this if not provided!)' }
    },
    required: []
  },
  execute: async (args, { supabase, device_id }) => {
    // Construct update object with only provided fields
    const updates: any = {};
    if (args.make) updates.make = args.make;
    if (args.model) updates.model = args.model;
    if (args.year) updates.year = args.year;
    if (args.fuel_type) updates.fuel_type = args.fuel_type;
    if (args.engine_displacement) updates.engine_displacement = args.engine_displacement;
    if (args.official_fuel_efficiency) updates.official_fuel_efficiency_l_100km = args.official_fuel_efficiency;

    if (Object.keys(updates).length === 0) {
      return { status: 'error', message: 'No valid fields provided to update.' };
    }

    const { error } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('device_id', device_id);

    if (error) throw new Error(`Database error: ${error.message}`);

    return {
      status: 'success',
      message: 'Vehicle profile updated successfully.',
      updated_fields: Object.keys(updates)
    };
  }
}

const get_recent_alerts: ToolDefinition = {
  name: 'get_recent_alerts',
  description: 'Get recent vehicle alerts, warnings, and diagnostic trouble codes (DTCs).',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', default: 5 }
    },
    required: []
  },
  execute: async ({ limit = 5 }, { supabase, device_id }) => {
    const { data: events, error } = await supabase
      .from('proactive_vehicle_events')
      .select('*')
      .eq('device_id', device_id)
      .in('severity', ['warning', 'error', 'critical'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`Database error: ${error.message}`)

    if (!events || events.length === 0) {
      return { found: false, message: 'No critical alerts or warnings found recently.' }
    }

    return {
      found: true,
      count: events.length,
      alerts: events.map((e: any) => ({
        time: e.created_at,
        severity: e.severity,
        title: e.title,
        description: e.description,
        type: e.event_type
      }))
    }
  }
}

const force_sync_gps51: ToolDefinition = {
  name: 'force_sync_gps51',
  description: 'Force a real-time sync with the GPS51 platform. Call this BEFORE checking location or trips if the user asks for "right now", "live", or "current" status, to ensure data is up-to-the-second.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why the sync is needed' }
    },
    required: []
  },
  execute: async (_, { supabase, device_id }) => {
    // Invoke the get-vehicle-live-status function
    const { data, error } = await supabase.functions.invoke('get-vehicle-live-status', {
      body: { device_id }
    })

    if (error) {
      console.error('Sync failed:', error)
      return { status: 'error', message: 'Failed to contact GPS satellites.' }
    }

    return {
      status: 'success',
      message: 'Successfully synchronized with live GPS data.',
      live_position: data
    }
  }
}

export const TOOLS: ToolDefinition[] = [
  force_sync_gps51, // NEW: Priority sync tool
  get_vehicle_status,
  get_trip_history,
  get_trip_analytics,      // NEW: Comprehensive trip analytics
  get_favorite_locations,  // NEW: Frequently visited spots
  get_vehicle_health,      // NEW: Health overview
  get_maintenance_updates, // NEW: Maintenance list
  get_fuel_stats,          // NEW: Fuel & Theft
  update_vehicle_profile,  // NEW: Update profile (Make/Model/Efficiency)
  get_recent_alerts,       // NEW: DTCs & Warnings
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
