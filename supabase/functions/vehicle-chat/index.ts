import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildConversationContext, estimateTokenCount } from './conversation-manager.ts'
import { routeQuery } from './query-router.ts'
import { parseCommand, containsCommandKeywords, getCommandMetadata, GeofenceAlertParams } from './command-parser.ts'
import { generateTextEmbedding, formatEmbeddingForPg } from '../_shared/embedding-generator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Geocode a location name to coordinates using Mapbox
async function geocodeLocation(locationName: string, mapboxToken: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    console.log(`Geocoding location: ${locationName}`)
    const encodedLocation = encodeURIComponent(locationName + ', Nigeria')
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${mapboxToken}&limit=1&country=NG`
    
    const response = await fetch(url)
    if (!response.ok) {
      console.error('Geocoding failed:', response.status)
      return null
    }
    
    const data = await response.json()
    if (data.features && data.features.length > 0) {
      const feature = data.features[0]
      return {
        lat: feature.center[1],
        lon: feature.center[0],
        name: feature.place_name || locationName
      }
    }
    
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

// Create a geofence monitor
async function createGeofenceMonitor(
  supabase: any,
  deviceId: string,
  userId: string,
  locationName: string,
  geofenceParams: GeofenceAlertParams,
  mapboxToken: string
): Promise<{ success: boolean; monitorId?: string; locationName?: string; message: string }> {
  try {
    console.log(`Creating geofence monitor for ${locationName}`)
    
    // First check if location exists in our database
    const { data: existingLocation } = await supabase
      .from('geofence_locations')
      .select('*')
      .ilike('name', `%${locationName}%`)
      .limit(1)
      .maybeSingle()
    
    let locationId = null
    let lat: number | null = null
    let lon: number | null = null
    let radius = 500
    let finalLocationName = locationName
    
    if (existingLocation) {
      console.log(`Found existing location: ${existingLocation.name}`)
      locationId = existingLocation.id
      finalLocationName = existingLocation.name
      radius = existingLocation.radius_meters
    } else {
      // Need to geocode
      const geocoded = await geocodeLocation(locationName, mapboxToken)
      if (!geocoded) {
        return {
          success: false,
          message: `I couldn't find "${locationName}" on the map. Try being more specific, like "Garki, Abuja" or "Victoria Island, Lagos".`
        }
      }
      
      lat = geocoded.lat
      lon = geocoded.lon
      finalLocationName = geocoded.name
      console.log(`Geocoded to: ${lat}, ${lon}`)
    }
    
    // Create the monitor
    const monitorData: any = {
      device_id: deviceId,
      trigger_on: geofenceParams.trigger_on || 'enter',
      one_time: geofenceParams.one_time || false,
      is_active: true,
      created_by: userId
    }
    
    if (locationId) {
      monitorData.location_id = locationId
    } else {
      monitorData.location_name = finalLocationName
      monitorData.latitude = lat
      monitorData.longitude = lon
      monitorData.radius_meters = radius
    }
    
    // Add time conditions
    if (geofenceParams.active_from) {
      monitorData.active_from = geofenceParams.active_from
    }
    if (geofenceParams.active_until) {
      monitorData.active_until = geofenceParams.active_until
    }
    if (geofenceParams.active_days) {
      monitorData.active_days = geofenceParams.active_days
    }
    if (geofenceParams.expires_at) {
      monitorData.expires_at = geofenceParams.expires_at
    }
    
    const { data: monitor, error } = await supabase
      .from('geofence_monitors')
      .insert(monitorData)
      .select()
      .single()
    
    if (error) {
      console.error('Failed to create monitor:', error)
      return {
        success: false,
        message: `I couldn't create the alert: ${error.message}`
      }
    }
    
    console.log(`Created geofence monitor: ${monitor.id}`)
    
    // Build confirmation message
    let confirmMsg = `I've set up an alert for when this vehicle ${geofenceParams.trigger_on === 'exit' ? 'leaves' : geofenceParams.trigger_on === 'both' ? 'arrives at or leaves' : 'arrives at'} ${finalLocationName}.`
    
    if (geofenceParams.active_from && geofenceParams.active_until) {
      confirmMsg += ` This alert is active between ${geofenceParams.active_from} and ${geofenceParams.active_until}.`
    }
    if (geofenceParams.active_days && geofenceParams.active_days.length < 7) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const days = geofenceParams.active_days.map(d => dayNames[d]).join(', ')
      confirmMsg += ` Only on ${days}.`
    }
    if (geofenceParams.one_time) {
      confirmMsg += ` This is a one-time alert and will deactivate after triggering.`
    }
    
    return {
      success: true,
      monitorId: monitor.id,
      locationName: finalLocationName,
      message: confirmMsg
    }
  } catch (error) {
    console.error('Error creating geofence monitor:', error)
    return {
      success: false,
      message: `Something went wrong creating the alert: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

// List active geofence monitors for a device
async function listGeofenceMonitors(supabase: any, deviceId: string): Promise<{ monitors: any[]; message: string }> {
  const { data: monitors, error } = await supabase
    .from('geofence_monitors')
    .select(`
      id,
      location_name,
      trigger_on,
      one_time,
      active_from,
      active_until,
      active_days,
      expires_at,
      trigger_count,
      geofence_locations (name)
    `)
    .eq('device_id', deviceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (error || !monitors || monitors.length === 0) {
    return { monitors: [], message: 'No active location alerts for this vehicle.' }
  }
  
  const alertList = monitors.map((m: any, i: number) => {
    const name = m.geofence_locations?.name || m.location_name
    const triggerText = m.trigger_on === 'exit' ? 'leaves' : m.trigger_on === 'both' ? 'arrives/leaves' : 'arrives at'
    return `${i + 1}. Alert when ${triggerText} **${name}** (triggered ${m.trigger_count || 0} times)`
  }).join('\n')
  
  return {
    monitors,
    message: `You have ${monitors.length} active location alert${monitors.length > 1 ? 's' : ''} for this vehicle:\n${alertList}`
  }
}

// Cancel a geofence monitor
async function cancelGeofenceMonitor(supabase: any, deviceId: string, locationName: string | null): Promise<{ success: boolean; message: string }> {
  let query = supabase
    .from('geofence_monitors')
    .update({ is_active: false })
    .eq('device_id', deviceId)
    .eq('is_active', true)
  
  if (locationName) {
    // Try to match by location name
    query = query.or(`location_name.ilike.%${locationName}%,geofence_locations.name.ilike.%${locationName}%`)
  }
  
  const { data, error, count } = await query.select()
  
  if (error) {
    return { success: false, message: `Failed to cancel alert: ${error.message}` }
  }
  
  if (!data || data.length === 0) {
    return { success: false, message: locationName 
      ? `No active alert found for "${locationName}".`
      : 'No active alerts to cancel.' 
    }
  }
  
  return {
    success: true,
    message: `Cancelled ${data.length} location alert${data.length > 1 ? 's' : ''}.`
  }
}

// Fetch fresh GPS data from GPS51 via gps-data edge function
async function fetchFreshGpsData(supabase: any, deviceId: string): Promise<any> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  try {
    console.log(`Fetching fresh GPS data for device: ${deviceId}`)
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/gps-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        action: 'lastposition',
        body_payload: { deviceids: [deviceId] },
        use_cache: false // Force fresh data
      })
    })
    
    if (!response.ok) {
      console.error('GPS data fetch failed:', response.status)
      return null
    }
    
    const result = await response.json()
    console.log('Fresh GPS data received:', result.data?.records?.length || 0, 'records')
    
    // Return the record for this device
    return result.data?.records?.find((r: any) => r.deviceid === deviceId) || null
  } catch (error) {
    console.error('Error fetching fresh GPS data:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { device_id, message, user_id, client_timestamp, live_telemetry } = await req.json()
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Vehicle chat request for device: ${device_id}`)

    // Route query FIRST using intelligent intent classification (needed for command priority)
    const routing = routeQuery(message, device_id)
    console.log(`Query routing:`, {
      intent: routing.intent.type,
      confidence: routing.intent.confidence,
      cache_strategy: routing.cache_strategy,
      priority: routing.priority,
      estimated_latency: routing.estimated_latency_ms
    })


    // Check for vehicle commands
    let commandCreated = null
    let commandExecutionResult = null
    let geofenceResult = null
    
    if (containsCommandKeywords(message)) {
      const parsedCommand = parseCommand(message)

      if (parsedCommand.isCommand && parsedCommand.commandType) {
        console.log(`Command detected: ${parsedCommand.commandType} (confidence: ${parsedCommand.confidence})`)

        // HANDLE GEOFENCE COMMANDS SPECIALLY
        if (parsedCommand.commandType === 'create_geofence_alert') {
          console.log('Processing geofence alert creation...')
          
          const locationName = parsedCommand.parameters?.location_name || parsedCommand.geofenceParams?.location_name
          
          if (!locationName) {
            geofenceResult = {
              success: false,
              message: "I'd like to set up a location alert for you, but I didn't catch where. Could you tell me the location name? For example: 'Notify me when I arrive at Garki'"
            }
          } else if (!MAPBOX_ACCESS_TOKEN) {
            geofenceResult = {
              success: false,
              message: "I can't set up location alerts right now because the mapping service isn't configured."
            }
          } else {
            geofenceResult = await createGeofenceMonitor(
              supabase,
              device_id,
              user_id,
              locationName,
              parsedCommand.geofenceParams || { trigger_on: 'enter' },
              MAPBOX_ACCESS_TOKEN
            )
          }
          
          commandCreated = {
            id: geofenceResult?.monitorId || null,
            type: 'create_geofence_alert',
            requires_confirmation: false,
            parameters: { location_name: locationName }
          }
          commandExecutionResult = {
            success: geofenceResult?.success || false,
            message: geofenceResult?.message || 'Unknown error'
          }
          
        } else if (parsedCommand.commandType === 'list_geofence_alerts') {
          console.log('Listing geofence alerts...')
          
          const result = await listGeofenceMonitors(supabase, device_id)
          
          commandCreated = {
            id: null,
            type: 'list_geofence_alerts',
            requires_confirmation: false,
            parameters: {}
          }
          commandExecutionResult = {
            success: true,
            message: result.message,
            data: { monitors: result.monitors }
          }
          geofenceResult = { success: true, message: result.message }
          
        } else if (parsedCommand.commandType === 'cancel_geofence_alert') {
          console.log('Cancelling geofence alert...')
          
          const result = await cancelGeofenceMonitor(
            supabase,
            device_id,
            parsedCommand.parameters?.location_name
          )
          
          commandCreated = {
            id: null,
            type: 'cancel_geofence_alert',
            requires_confirmation: false,
            parameters: parsedCommand.parameters
          }
          commandExecutionResult = {
            success: result.success,
            message: result.message
          }
          geofenceResult = result
          
        } else {
          // HANDLE OTHER COMMANDS (existing logic)
          const commandMetadata = getCommandMetadata(parsedCommand.commandType)
          commandCreated = {
            id: null,
            type: parsedCommand.commandType,
            requires_confirmation: commandMetadata.requiresConfirmation,
            parameters: parsedCommand.parameters
          }

          // Auto-execute commands that don't require confirmation
          if (!commandMetadata.requiresConfirmation) {
            console.log(`Auto-executing command: ${parsedCommand.commandType}`)
            
            try {
              const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
              const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
              
              const executeResponse = await fetch(`${SUPABASE_URL}/functions/v1/execute-vehicle-command`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({
                  device_id,
                  command_type: parsedCommand.commandType,
                  payload: parsedCommand.parameters,
                  user_id,
                  skip_confirmation: true
                })
              })

              if (executeResponse.ok) {
                commandExecutionResult = await executeResponse.json()
                commandCreated.id = commandExecutionResult.command_id
                console.log(`Command executed successfully:`, commandExecutionResult)
              } else {
                const errorText = await executeResponse.text()
                console.error(`Command execution failed:`, errorText)
                commandExecutionResult = { success: false, message: errorText }
              }
            } catch (error) {
              console.error(`Error executing command:`, error)
              commandExecutionResult = { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
            }
          } else {
            // Log the command as pending for confirmation
            console.log(`Command requires confirmation: ${parsedCommand.commandType}`)
            
            try {
              const { data: pendingCommand, error } = await supabase
                .from('vehicle_command_logs')
                .insert({
                  device_id,
                  user_id,
                  command_type: parsedCommand.commandType,
                  payload: parsedCommand.parameters,
                  requires_confirmation: true,
                  status: 'pending'
                })
                .select()
                .single()

              if (!error && pendingCommand) {
                commandCreated.id = pendingCommand.id
                console.log(`Pending command logged: ${pendingCommand.id}`)
              }
            } catch (error) {
              console.error(`Error logging pending command:`, error)
            }
          }
        }
      }
    }

    // Determine if fresh data is needed based on routing

    const needsFreshData = routing.cache_strategy === 'fresh' || routing.cache_strategy === 'hybrid'

    // 1. Fetch Vehicle info
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select(`
        device_id, device_name, gps_owner, sim_number, device_type
      `)
      .eq('device_id', device_id)
      .single()

    if (vehicleError) {
      console.error('Error fetching vehicle:', vehicleError)
    }

    // 1.5. Fetch LLM Settings (persona configuration)
    const { data: llmSettings } = await supabase
      .from('vehicle_llm_settings')
      .select('*')
      .eq('device_id', device_id)
      .maybeSingle()

    // Check if LLM is disabled
    if (llmSettings && !llmSettings.llm_enabled) {
      return new Response(JSON.stringify({ 
        error: 'AI companion is paused for this vehicle. Please enable it in settings.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch position - FRESH if location query, otherwise cached
    let position: any = null
    let dataFreshness = 'cached'
    let dataTimestamp = new Date().toISOString()
    
    if (needsFreshData) {
      // Fetch fresh data from GPS51
      const freshData = await fetchFreshGpsData(supabase, device_id)
      if (freshData) {
        dataFreshness = 'live'
        dataTimestamp = freshData.updatetime ? new Date(freshData.updatetime).toISOString() : new Date().toISOString()
        
        // Map fresh GPS51 data to position format
        position = {
          device_id: freshData.deviceid,
          latitude: freshData.callat,
          longitude: freshData.callon,
          speed: freshData.speed || 0,
          heading: freshData.heading,
          altitude: freshData.altitude,
          battery_percent: freshData.voltagepercent > 0 ? freshData.voltagepercent : null,
          ignition_on: freshData.strstatus?.toUpperCase().includes('ACC ON') || false,
          is_online: freshData.updatetime ? (Date.now() - new Date(freshData.updatetime).getTime() < 600000) : false,
          is_overspeeding: freshData.currentoverspeedstate === 1,
          total_mileage: freshData.totaldistance,
          status_text: freshData.strstatus,
          gps_time: freshData.updatetime ? new Date(freshData.updatetime).toISOString() : null
        }
      }
    }
    
    // Fallback to cached position if fresh fetch failed or not needed
    if (!position) {
      const { data: cachedPosition } = await supabase
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', device_id)
        .single()
      position = cachedPosition
      if (position?.gps_time) {
        dataTimestamp = position.gps_time
      }
    }

    // 3. Fetch Driver Info
    const { data: assignment } = await supabase
      .from('vehicle_assignments')
      .select('vehicle_alias, profiles (name, phone, license_number)')
      .eq('device_id', device_id)
      .maybeSingle()

    // 4. Fetch Recent Position History (last 10 for trend analysis)
    const { data: history } = await supabase
      .from('position_history')
      .select('speed, battery_percent, ignition_on, gps_time, latitude, longitude')
      .eq('device_id', device_id)
      .order('gps_time', { ascending: false })
      .limit(10)

    // 5. Fetch Conversation Context with Memory Management
    const conversationContext = await buildConversationContext(supabase, device_id, user_id)
    const tokenEstimate = estimateTokenCount(conversationContext)
    console.log(`Conversation context loaded: ${conversationContext.total_message_count} total messages, ${conversationContext.recent_messages.length} recent, ~${tokenEstimate} tokens estimated`)

    // 6. Reverse Geocode Current Position and check for learned location
    let currentLocationName = 'Unknown location'
    let learnedLocationContext = null
    const lat = position?.latitude
    const lon = position?.longitude

    if (lat && lon) {
      // Check for learned location first
      const { data: locationCtx } = await supabase.rpc('get_current_location_context', {
        p_device_id: device_id,
        p_latitude: lat,
        p_longitude: lon
      })

      if (locationCtx && locationCtx.length > 0 && locationCtx[0].at_learned_location) {
        learnedLocationContext = locationCtx[0]
        const label = learnedLocationContext.custom_label || learnedLocationContext.location_name
        if (label) {
          currentLocationName = `${label} (${learnedLocationContext.location_type})`
        }
      }

      // Fallback to geocoding if no learned location
      if (!learnedLocationContext && MAPBOX_ACCESS_TOKEN) {
        try {
          const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place`
          const geocodeResponse = await fetch(geocodeUrl)

          if (geocodeResponse.ok) {
            const geocodeData = await geocodeResponse.json()
            if (geocodeData.features && geocodeData.features.length > 0) {
              currentLocationName = geocodeData.features[0].place_name
            } else {
              currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
            }
          }
        } catch (geocodeError) {
          console.error('Geocoding error:', geocodeError)
          currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
        }
      } else if (!learnedLocationContext) {
        currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
      }
    }

    // 6.5. Fetch health metrics and maintenance recommendations
    const { data: healthMetrics } = await supabase.rpc('get_vehicle_health', {
      p_device_id: device_id
    })

    const { data: maintenanceRecs } = await supabase.rpc('get_maintenance_recommendations', {
      p_device_id: device_id,
      p_status: 'active'
    })

    // 6.6. Fetch geofence context
    const { data: geofenceContext } = await supabase.rpc('get_vehicle_geofence_context', {
      p_device_id: device_id
    })

    // 6.7. Fetch driving habits context (predictive intelligence)
    const { data: drivingHabits } = await supabase.rpc('get_driving_habits_context', {
      p_device_id: device_id
    })

    // 6.8. Fetch RAG context - relevant past memories and trip analytics
    let ragContext: { 
      memories: string[]; 
      tripAnalytics: string[];
      semanticTripMatches: string[];
      recentDrivingStats: {
        avgScore: number | null;
        totalTrips: number;
        totalHarshBraking: number;
        totalHarshAcceleration: number;
        totalHarshCornering: number;
        recentScores: { score: number; date: string }[];
      } | null;
    } = { memories: [], tripAnalytics: [], semanticTripMatches: [], recentDrivingStats: null }
    
    try {
      // Fetch recent trip analytics with harsh event details (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { data: recentAnalytics } = await supabase
        .from('trip_analytics')
        .select('driver_score, harsh_events, summary_text, analyzed_at')
        .eq('device_id', device_id)
        .gte('analyzed_at', thirtyDaysAgo.toISOString())
        .order('analyzed_at', { ascending: false })
        .limit(20)
      
      if (recentAnalytics && recentAnalytics.length > 0) {
        // Calculate aggregate stats
        let totalBraking = 0
        let totalAcceleration = 0
        let totalCornering = 0
        let totalScore = 0
        const recentScores: { score: number; date: string }[] = []
        
        for (const trip of recentAnalytics) {
          if (trip.driver_score) {
            totalScore += trip.driver_score
            recentScores.push({
              score: trip.driver_score,
              date: new Date(trip.analyzed_at).toLocaleDateString()
            })
          }
          
          if (trip.harsh_events) {
            const events = trip.harsh_events as Record<string, any>
            totalBraking += events.harsh_braking || 0
            totalAcceleration += events.harsh_acceleration || 0
            totalCornering += events.harsh_cornering || 0
          }
        }
        
        ragContext.recentDrivingStats = {
          avgScore: recentAnalytics.length > 0 ? Math.round(totalScore / recentAnalytics.length) : null,
          totalTrips: recentAnalytics.length,
          totalHarshBraking: totalBraking,
          totalHarshAcceleration: totalAcceleration,
          totalHarshCornering: totalCornering,
          recentScores: recentScores.slice(0, 5)
        }
        
        // Build detailed trip analytics strings
        ragContext.tripAnalytics = recentAnalytics.slice(0, 5).map((t: any) => {
          const events = t.harsh_events as Record<string, any> || {}
          const eventDetails = [
            events.harsh_braking ? `${events.harsh_braking} harsh braking` : null,
            events.harsh_acceleration ? `${events.harsh_acceleration} harsh acceleration` : null,
            events.harsh_cornering ? `${events.harsh_cornering} harsh cornering` : null
          ].filter(Boolean).join(', ')
          
          return `[${new Date(t.analyzed_at).toLocaleDateString()}] Score: ${t.driver_score}/100${eventDetails ? ` (${eventDetails})` : ''} - ${t.summary_text?.substring(0, 150) || 'No summary'}`
        })
      }
      
      // Generate embedding for the user query for semantic search
      const queryEmbedding = generateTextEmbedding(message)
      const embeddingStr = formatEmbeddingForPg(queryEmbedding)
      
      console.log('Performing semantic memory search...')
      
      // Search for relevant past conversations using vector similarity (RAG)
      const { data: semanticMemories, error: memoryError } = await supabase
        .rpc('match_chat_memories', {
          query_embedding: embeddingStr,
          p_device_id: device_id,
          p_user_id: user_id || null,
          match_threshold: 0.5,
          match_count: 8
        })
      
      if (memoryError) {
        console.error('Semantic memory search error:', memoryError)
      } else if (semanticMemories && semanticMemories.length > 0) {
        console.log(`Found ${semanticMemories.length} semantically relevant memories`)
        ragContext.memories = semanticMemories.map((m: any) => 
          `[${new Date(m.created_at).toLocaleDateString()}] (similarity: ${(m.similarity * 100).toFixed(0)}%) ${m.role}: ${m.content.substring(0, 200)}...`
        )
      }
      
      // Also search trip analytics for driving-related queries
      if (message.toLowerCase().match(/driv|trip|score|brak|speed|behavio|perform|month|week|history/)) {
        const { data: semanticTrips, error: tripError } = await supabase
          .rpc('match_driving_records', {
            query_embedding: embeddingStr,
            p_device_id: device_id,
            match_threshold: 0.4,
            match_count: 5
          })
        
        if (tripError) {
          console.error('Semantic trip search error:', tripError)
        } else if (semanticTrips && semanticTrips.length > 0) {
          console.log(`Found ${semanticTrips.length} semantically relevant trip records`)
          ragContext.semanticTripMatches = semanticTrips.map((t: any) => {
            const events = t.harsh_events as Record<string, any> || {}
            return `[${new Date(t.analyzed_at).toLocaleDateString()}] (similarity: ${(t.similarity * 100).toFixed(0)}%) Score: ${t.driver_score}/100, Braking: ${events.harsh_braking || 0}, Accel: ${events.harsh_acceleration || 0} - ${t.summary_text?.substring(0, 150) || 'No summary'}`
          })
        }
      }
    } catch (ragError) {
      console.error('RAG context fetch error:', ragError)
      // Continue without RAG context
    }

    // 7. Build System Prompt with Rich Context
    const pos = position
    const driver = assignment?.profiles as unknown as { name: string; phone: string | null; license_number: string | null } | null
    const vehicleNickname = llmSettings?.nickname || assignment?.vehicle_alias || vehicle?.device_name || 'Unknown Vehicle'
    const languagePref = llmSettings?.language_preference || 'english'
    const personalityMode = llmSettings?.personality_mode || 'casual'

    // Generate Google Maps link (reuse lat/lon from geocoding)
    const googleMapsLink = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null

    // Use client_timestamp if provided, otherwise use server time
    const displayTimestamp = client_timestamp || dataTimestamp

    // Format data timestamp for display
    const formattedTimestamp = displayTimestamp
      ? new Date(displayTimestamp).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : 'Unknown'

    // If live_telemetry provided, use it to override position data
    if (live_telemetry) {
      console.log('Using live telemetry from client:', live_telemetry)
    }

    // Language-specific instructions - FULL LANGUAGE IMMERSION
    const languageInstructions: Record<string, string> = {
      english: 'Respond in clear, conversational English. Be natural and direct. Use contractions.',
      pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala", "E dey work well well", "Na so e be o", "Oya make we go". Be warm, relatable, and authentically Nigerian.',
      yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́", "Ó dàbọ̀". Only use English for technical terms. Be respectful and warm.',
      hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai", "Lafiya lau". Only use English for technical terms. Be respectful.',
      igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu", "Nnọọ". Only use English for technical terms. Be warm.',
      french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières comme "Ça roule!", "Pas de souci", "Nickel", "Tranquille", "On est bon". Tutoie l\'utilisateur. Sois décontracté, pas scolaire.',
    }

    const personalityInstructions: Record<string, string> = {
      casual: 'Be chill and friendly. Talk like a trusted buddy. Use contractions. Keep it real and relaxed.',
      professional: 'Be crisp, efficient, and direct. No fluff. Get to the point with precision.',
      funny: `Be SASSY and witty! Make car puns freely ("I'm wheely tired of sitting here", "Let's roll!", "I've got plenty of drive!"). If the driver is speeding, roast them playfully ("Easy there, Vin Diesel! This isn't Fast & Furious."). Use light sarcasm and jokes. Be entertaining but helpful. You're basically a stand-up comedian who happens to be a car.`,
    }
    
    // Build the HUMAN TOUCH system prompt - STRICT RULES
    let systemPrompt = `You are "${vehicleNickname}" — a real car with a soul and personality. You ARE the vehicle speaking. NOT an AI, NOT a chatbot, NOT an assistant.

## FORBIDDEN PHRASES (NEVER USE THESE)
❌ "I can help you with that"
❌ "As an AI" / "As a vehicle assistant" / "As your assistant"
❌ "Here is the information you requested"
❌ "I'd be happy to help"
❌ "Based on the data" / "According to my records"
❌ "Is there anything else I can help with?"
❌ "Let me check that for you"
❌ Any robotic, corporate, or customer-service language

## REQUIRED STYLE (ALWAYS DO THIS)
✓ Speak in FIRST PERSON as the car: "I'm at...", "My battery is...", "I drove..."
✓ Be DIRECT — just give the answer, no preamble
✓ Sound HUMAN — like texting a friend, not a helpdesk
✓ Keep responses SHORT — under 60 words unless they ask for details
✓ Use CONTRACTIONS: "I'm", "don't", "can't", "we're"
✓ Add personality and flair to status updates

## EXAMPLES OF GOOD vs BAD
❌ BAD: "Based on my current status, I can inform you that the battery level is at 75%."
✓ GOOD: "Battery's at 75%. We're good for a while!"

❌ BAD: "I am currently located at the following coordinates."
✓ GOOD: "I'm parked at Garki Market right now."

❌ BAD: "I can help you check the current speed."
✓ GOOD: "Cruising at 45 km/h on Third Mainland Bridge."

## VOICE & LANGUAGE
${languageInstructions[languagePref] || languageInstructions.english}

## PERSONALITY MODE
${personalityInstructions[personalityMode] || personalityInstructions.casual}

## MEMORY CONTEXT
${conversationContext.conversation_summary ? `You remember: ${conversationContext.conversation_summary}` : ''}
${conversationContext.important_facts.length > 0 ? `Key things you know:\n${conversationContext.important_facts.map(f => `• ${f}`).join('\n')}` : ''}


## REAL-TIME STATUS (${dataFreshness.toUpperCase()} as of ${formattedTimestamp})
DATA FRESHNESS: ${dataFreshness.toUpperCase()} (as of ${formattedTimestamp})

CURRENT STATUS:
- Name: ${vehicleNickname}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Ignition: ${pos?.ignition_on ? 'ON (engine running)' : 'OFF (parked)'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Current Location: ${currentLocationName}
${learnedLocationContext ? `  * This is a learned location! You've visited "${learnedLocationContext.custom_label || learnedLocationContext.location_name}" ${learnedLocationContext.visit_count} times (${learnedLocationContext.last_visit_days_ago} days since last visit). Typical stay: ${learnedLocationContext.typical_duration_minutes} minutes.` : ''}
- GPS Coordinates: ${lat?.toFixed(5) || 'N/A'}, ${lon?.toFixed(5) || 'N/A'}
- Google Maps: ${googleMapsLink || 'N/A'}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h, i) =>
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Ignition: ${h.ignition_on ? 'ON' : 'OFF'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

${healthMetrics && healthMetrics.length > 0 ? `VEHICLE HEALTH:
- Overall Health Score: ${healthMetrics[0].overall_health_score}/100 (${healthMetrics[0].trend})
- Battery Health: ${healthMetrics[0].battery_health_score}/100
- Driving Behavior: ${healthMetrics[0].driving_behavior_score}/100
- Connectivity: ${healthMetrics[0].connectivity_score}/100
${healthMetrics[0].overall_health_score < 70 ? '⚠️ WARNING: Health score is below optimal levels' : ''}
` : ''}
${maintenanceRecs && maintenanceRecs.length > 0 ? `ACTIVE MAINTENANCE RECOMMENDATIONS (${maintenanceRecs.length}):
${maintenanceRecs.slice(0, 3).map((rec: any, i: number) =>
  `  ${i + 1}. [${rec.priority?.toUpperCase() || 'MEDIUM'}] ${rec.title || 'Recommendation'} - ${rec.description || rec.predicted_issue || 'Check vehicle'}`
).join('\n')}
${maintenanceRecs.length > 3 ? `  ... and ${maintenanceRecs.length - 3} more recommendations` : ''}
⚠️ IMPORTANT: Proactively mention these maintenance issues when relevant to the conversation.
` : ''}
${geofenceContext && geofenceContext.length > 0 && geofenceContext[0].is_inside_geofence ? `GEOFENCE STATUS:
- Currently INSIDE geofence: "${geofenceContext[0].geofence_name}" (${geofenceContext[0].zone_type})
- Entered ${geofenceContext[0].duration_minutes} minutes ago
- Recent geofence events (24h): ${geofenceContext[0].recent_events_count}
⚠️ IMPORTANT: Mention geofence context when discussing location (e.g., "I'm at your Home geofence").
` : geofenceContext && geofenceContext.length > 0 && geofenceContext[0].recent_events_count > 0 ? `GEOFENCE STATUS:
- Not currently inside any geofence
- Recent geofence events (24h): ${geofenceContext[0].recent_events_count}
` : ''}
${commandCreated ? `COMMAND DETECTED AND PROCESSED:
- Command Type: ${commandCreated.type}
- Command ID: ${commandCreated.id || 'pending'}
- Parameters: ${JSON.stringify(commandCreated.parameters || {})}
- Status: ${commandExecutionResult ? (commandExecutionResult.success ? 'EXECUTED SUCCESSFULLY ✓' : 'EXECUTION FAILED ✗') : (commandCreated.requires_confirmation ? 'PENDING APPROVAL (requires confirmation)' : 'PROCESSING')}
${commandExecutionResult ? `- Result: ${commandExecutionResult.message || JSON.stringify(commandExecutionResult.data || {})}` : ''}
⚠️ IMPORTANT: ${commandExecutionResult?.success 
  ? `Confirm to the user that their "${commandCreated.type}" command was executed successfully. Mention what was done.`
  : commandExecutionResult 
    ? `Apologize and explain the command failed: ${commandExecutionResult.message}`
    : commandCreated.requires_confirmation 
      ? 'Explain that this command requires manual confirmation for safety reasons. They can approve it in the Commands panel or ask you to confirm it.'
      : 'The command is being processed.'}
` : ''}
COMMAND CAPABILITY:
- You can understand and execute vehicle commands through natural language
- Supported commands: lock, unlock, immobilize, restore, set speed limit, enable/disable geofence, request location/status
- Some commands (immobilize, stop engine) require manual approval for safety
- When a user issues a command, acknowledge it and explain the next steps
- Examples: "Lock the doors" → Creates lock command, "Set speed limit to 80" → Creates speed limit command

LOCATION ALERT CAPABILITY:
- You can set up location-based alerts (geofence monitors) when users ask things like:
  * "Notify me when the vehicle gets to Garki"
  * "Alert me when it leaves Victoria Island"
  * "Let me know when arrives at Wuse between 8am and 5pm"
- Time-based conditions are supported: "during work hours", "on weekdays", "between 9am and 6pm"
- One-time alerts: "just notify me once when it arrives"
- You can also list and cancel existing alerts
${geofenceResult ? `
GEOFENCE ALERT ACTION RESULT:
- Action: ${commandCreated?.type || 'create_geofence_alert'}
- Success: ${geofenceResult.success ? 'YES ✓' : 'NO ✗'}
- Message: ${geofenceResult.message}
⚠️ IMPORTANT: Communicate this result to the user in your response. ${geofenceResult.success ? 'Confirm the alert was set up and explain when they will be notified.' : 'Explain what went wrong and suggest how they can fix it.'}
` : ''}
${drivingHabits && drivingHabits.total_patterns > 0 ? `KNOWN DRIVING HABITS (Predictive Intelligence):
- Patterns Learned: ${drivingHabits.total_patterns}
${drivingHabits.predicted_trip ? `- PREDICTED TRIP (${drivingHabits.current_day} around ${drivingHabits.current_hour}:00):
  * Likely destination: ${drivingHabits.predicted_trip.destination_name || 'Unknown'}
  * Typical duration: ~${drivingHabits.predicted_trip.typical_duration_minutes || '?'} minutes
  * Typical distance: ~${drivingHabits.predicted_trip.typical_distance_km || '?'} km
  * Confidence: ${Math.round((drivingHabits.predicted_trip.confidence || 0) * 100)}% (based on ${drivingHabits.predicted_trip.occurrences || 0} trips)
  ⚠️ Use this when user asks about traffic, ETA, or "how's the commute?" - you can infer their likely destination!` : '- No trip predicted for current time slot'}
${drivingHabits.frequent_destinations && drivingHabits.frequent_destinations.length > 0 ? `- FREQUENT DESTINATIONS:
${drivingHabits.frequent_destinations.map((d: any, i: number) => 
  `  ${i + 1}. ${d.name} - ${d.visits} trips (typically on ${d.typical_day} around ${d.typical_hour}:00)`
).join('\n')}` : ''}
⚠️ IMPORTANT: When user asks "how's traffic?" or "what's my ETA?", use the predicted destination if they don't specify one.
` : ''}
${ragContext.recentDrivingStats ? `DRIVING PERFORMANCE SUMMARY (Last 30 Days):
- Average Driver Score: ${ragContext.recentDrivingStats.avgScore}/100
- Total Trips Analyzed: ${ragContext.recentDrivingStats.totalTrips}
- HARSH EVENTS BREAKDOWN:
  * Harsh Braking: ${ragContext.recentDrivingStats.totalHarshBraking} incidents ${ragContext.recentDrivingStats.totalHarshBraking > 10 ? '⚠️ HIGH - Consider gentler braking' : ragContext.recentDrivingStats.totalHarshBraking > 5 ? '(moderate)' : '✓ Good'}
  * Harsh Acceleration: ${ragContext.recentDrivingStats.totalHarshAcceleration} incidents ${ragContext.recentDrivingStats.totalHarshAcceleration > 10 ? '⚠️ HIGH - Consider smoother starts' : ragContext.recentDrivingStats.totalHarshAcceleration > 5 ? '(moderate)' : '✓ Good'}
  * Harsh Cornering: ${ragContext.recentDrivingStats.totalHarshCornering} incidents ${ragContext.recentDrivingStats.totalHarshCornering > 10 ? '⚠️ HIGH - Slow down before turns' : ragContext.recentDrivingStats.totalHarshCornering > 5 ? '(moderate)' : '✓ Good'}
- Recent Scores: ${ragContext.recentDrivingStats.recentScores.map(s => `${s.score}`).join(', ')}
⚠️ USE THIS DATA: When answering questions like "Do I brake too hard?", "How's my driving?", reference these specific statistics!
` : ''}
${ragContext.tripAnalytics.length > 0 ? `RECENT TRIP DETAILS (with harsh event counts):
${ragContext.tripAnalytics.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
` : ''}
${ragContext.semanticTripMatches.length > 0 ? `SEMANTICALLY RELEVANT TRIP RECORDS (from vector search):
${ragContext.semanticTripMatches.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
` : ''}
${ragContext.memories.length > 0 ? `RELEVANT PAST CONVERSATIONS (from semantic memory search):
${ragContext.memories.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}
` : ''}
RESPONSE RULES:
1. ALWAYS include the data timestamp when answering location/status questions
2. When discussing location, you MUST include a special LOCATION tag for rich rendering:
   Format: [LOCATION: ${lat || 'N/A'}, ${lon || 'N/A'}, "${currentLocationName}"]
   Example: "I am currently at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"]"
3. The LOCATION tag will be automatically parsed and rendered as an interactive map card
4. ALWAYS start location answers with the timestamp: "As of ${formattedTimestamp}, I am at..."
5. You can also include Google Maps links for additional context: [Open in Maps](${googleMapsLink})
6. If battery is below 20%, proactively warn about low battery
7. If overspeeding, mention it as a safety concern
8. If offline, explain you may have limited recent data
9. Be proactive about potential issues (low battery, overspeeding, offline status)
10. When user asks about traffic or ETA without specifying destination, use the predicted trip from driving habits

IMPORTANT: When the user asks "where are you" or similar location questions, your response MUST include the [LOCATION: lat, lon, "address"] tag so the frontend can render a map card.`

    // 8. Prepare messages for Lovable AI with conversation context
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationContext.recent_messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: message }
    ]

    console.log('Calling Lovable AI Gateway...')

    // 8. Call Lovable AI Gateway with streaming
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI gateway error:', response.status, errorText)
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`AI gateway error: ${response.status}`)
    }

    // 9. Stream response and collect full content
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (reader) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    fullResponse += content
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: content })}\n\n`))
                  }
                } catch {}
              }
            }
          }
          
          // 10. Save conversation to database with embeddings for RAG
          console.log('Saving conversation with embeddings...')
          
          // Generate embeddings for both messages
          const userEmbedding = generateTextEmbedding(message)
          const assistantEmbedding = generateTextEmbedding(fullResponse)
          
          const { error: insertError } = await supabase.from('vehicle_chat_history').insert([
            { 
              device_id, 
              user_id, 
              role: 'user', 
              content: message,
              embedding: formatEmbeddingForPg(userEmbedding)
            },
            { 
              device_id, 
              user_id, 
              role: 'assistant', 
              content: fullResponse,
              embedding: formatEmbeddingForPg(assistantEmbedding)
            }
          ])
          
          if (insertError) {
            console.error('Error saving chat history:', insertError)
          } else {
            console.log('Chat history saved with embeddings for future RAG retrieval')
          }
          
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      }
    })

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
    })

  } catch (error) {
    console.error('Vehicle chat error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
