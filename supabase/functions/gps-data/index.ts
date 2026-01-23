import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"
import { normalizeVehicleTelemetry, type Gps51RawData } from "../_shared/telemetry-normalizer.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 30000 // 30 seconds
const OFFLINE_THRESHOLD_MS = 600000 // 10 minutes
const TOKEN_REFRESH_ERRORS = [9903, 9906]
const BATCH_SIZE = 50 // Process devices in batches to avoid memory limits

interface TokenData {
  value: string
  expires_at: string | null
  metadata: { username?: string; serverid?: string } | null
}

// Using shared getValidGps51Token from _shared/gps51-client.ts

// Check if cached data is still valid
async function getCachedPositions(supabase: any): Promise<any[] | null> {
  if (!supabase) return null
  
  try {
    const { data, error } = await supabase
      .from('vehicle_positions')
      .select('*, cached_at')
      .limit(1)

    if (error || !data?.length) return null

    const cachedAt = new Date(data[0].cached_at)
    if (Date.now() - cachedAt.getTime() > CACHE_TTL_MS) return null

    // Get all cached positions
    const { data: allPositions, error: allError } = await supabase
      .from('vehicle_positions')
      .select('*')

    if (allError || !allPositions) return null
    return allPositions
  } catch (err) {
    console.error('[getCachedPositions] Error:', err)
    return null
  }
}

// Note: parseIgnition and isOnline are now handled by telemetry-normalizer
// Keeping isOnline for backward compatibility in event detection
function isOnline(updateTime: number | null): boolean {
  if (!updateTime) return false
  const lastUpdate = new Date(updateTime)
  return Date.now() - lastUpdate.getTime() < OFFLINE_THRESHOLD_MS
}

// Log API call - ONLY log errors to reduce storage
async function logApiCall(supabase: any, action: string, requestBody: any, responseStatus: number, responseBody: any, errorMessage: string | null, durationMs: number) {
  // Only log errors (status !== 0) or explicit error messages
  if (responseStatus === 0 && !errorMessage) {
    return // Skip successful calls
  }
  
  try {
    await supabase.from('gps_api_logs').insert({
      action,
      request_body: requestBody,
      response_status: responseStatus,
      response_body: responseBody,
      error_message: errorMessage,
      duration_ms: durationMs
    })
  } catch (e) {
    console.error('Failed to log API call:', e)
  }
}

// Use shared GPS51 client (has centralized rate limiting)
// Wrapper to maintain compatibility with existing code
async function callGps51(proxyUrl: string, action: string, token: string, serverid: string, body: any, supabase: any): Promise<any> {
  const startTime = Date.now()
  
  const result = await callGps51WithRateLimit(supabase, proxyUrl, action, token, serverid, body)
  const duration = Date.now() - startTime
  
  return { result, duration }
}

// Sync vehicles from querymonitorlist - batch insert
async function syncVehicles(supabase: any, devices: any[]) {
  // Get primary admin profile ID (toolbuxdev@gmail.com or first admin)
  // This ensures all vehicles have a primary owner
  const { data: adminProfiles } = await supabase.rpc('get_admin_profile_ids');
  const primaryAdminProfileId = adminProfiles?.[0]?.profile_id || null;
  
  if (!primaryAdminProfileId) {
    console.warn('[syncVehicles] No admin profile found. Vehicles will be assigned via trigger.');
  }
  
  const vehicleData = devices.map(device => ({
    device_id: device.deviceid,
    device_name: device.devicename || device.deviceid,
    group_id: device.groupid,
    group_name: device.groupname,
    device_type: device.devicetype,
    sim_number: device.simnumber,
    gps_owner: device.creater || null,  // GPS51 account owner
    primary_owner_profile_id: primaryAdminProfileId, // Ensure primary owner is set
    last_synced_at: new Date().toISOString()
  }))
  
  // Batch upsert in chunks
  for (let i = 0; i < vehicleData.length; i += BATCH_SIZE) {
    const batch = vehicleData.slice(i, i + BATCH_SIZE)
    await supabase.from('vehicles').upsert(batch, { onConflict: 'device_id' })
  }
  
  if (primaryAdminProfileId) {
    console.log(`[syncVehicles] Synced ${devices.length} vehicles with primary owner: ${primaryAdminProfileId}`);
  }
}

// Haversine distance calculation (meters)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Sync positions from lastposition - batch insert with SMART HISTORY
async function syncPositions(supabase: any, records: any[]) {
  const now = new Date().toISOString()
  
  const positions = records.map(record => {
    // Normalize telemetry using centralized normalizer
    // This ensures JT808 status bits are properly detected and confidence is calculated
    const normalized = normalizeVehicleTelemetry(record as Gps51RawData, {
      offlineThresholdMs: OFFLINE_THRESHOLD_MS,
    });
    
    // Log low-confidence ignition detection for debugging
    if (normalized.ignition_confidence !== undefined && normalized.ignition_confidence < 0.5) {
      console.warn(`[syncPositions] Low ignition confidence (${normalized.ignition_confidence.toFixed(2)}) for device=${record.deviceid}, method=${normalized.ignition_detection_method}, status=${record.status}, strstatus=${record.strstatus}`);
    }
    
    // Debug: Log if speed > 200 after normalization (shouldn't happen unless raw was > 200000)
    if (normalized.speed_kmh > 200) {
      console.log(`[syncPositions] High speed detected: device=${record.deviceid}, raw_speed=${record.speed}, normalized=${normalized.speed_kmh} km/h`);
    }
    
    // Safety check: If normalized speed is between 200-1000, this is definitely wrong
    if (normalized.speed_kmh > 200 && normalized.speed_kmh < 1000) {
      console.error(`[syncPositions] ERROR: Device ${record.deviceid} has unnormalized speed ${normalized.speed_kmh}! Raw speed was ${record.speed}. Forcing correction...`);
      // Force normalize: divide by 1000 and apply threshold
      const correctedSpeed = normalized.speed_kmh / 1000;
      normalized.speed_kmh = correctedSpeed < 3 ? 0 : Math.min(correctedSpeed, 300);
      console.log(`[syncPositions] Corrected speed for ${record.deviceid}: ${normalized.speed_kmh} km/h`);
    }
    
    // FLEET-SCALE: Determine sync priority based on vehicle movement
    // Moving vehicles (>3 km/h) get high priority for more frequent syncs
    const syncPriority = normalized.is_moving ? 'high' : 'normal';

    return {
      device_id: normalized.vehicle_id,
      latitude: normalized.lat,
      longitude: normalized.lon,
      speed: normalized.speed_kmh, // Already normalized to km/h
      heading: normalized.heading,
      altitude: normalized.altitude,
      battery_percent: normalized.battery_level,
      ignition_on: normalized.ignition_on,
      ignition_confidence: normalized.ignition_confidence || null,
      ignition_detection_method: normalized.ignition_detection_method || null,
      is_online: normalized.is_online,
      is_overspeeding: record.currentoverspeedstate === 1,
      total_mileage: record.totaldistance,
      status_text: record.strstatus, // Keep raw status_text for debugging (not exposed to frontend)
      gps_time: normalized.last_updated_at,
      cached_at: now,
      last_synced_at: now,
      sync_priority: syncPriority
    };
  })

  // Batch upsert positions (always update current position)
  for (let i = 0; i < positions.length; i += BATCH_SIZE) {
    const batch = positions.slice(i, i + BATCH_SIZE)
    await supabase.from('vehicle_positions').upsert(batch, { 
      onConflict: 'device_id',
      ignoreDuplicates: false 
    })
  }
  
  console.log(`[syncPositions] Updated ${positions.length} positions (${positions.filter(p => p.sync_priority === 'high').length} moving)`)

  // SMART HISTORY: Only record if position changed significantly (>50m) or 5 min elapsed
  const validPositions = positions.filter(p => p.latitude && p.longitude)
  if (validPositions.length === 0) return
  
  const deviceIds = validPositions.map(p => p.device_id)
  
  // Fetch most recent history record for each device
  const { data: lastPositions } = await supabase
    .from('position_history')
    .select('device_id, latitude, longitude, recorded_at')
    .in('device_id', deviceIds)
    .order('recorded_at', { ascending: false })
  
  // Build lookup map of last position per device
  const lastPosMap = new Map<string, any>()
  if (lastPositions) {
    for (const pos of lastPositions) {
      if (!lastPosMap.has(pos.device_id)) {
        lastPosMap.set(pos.device_id, pos)
      }
    }
  }
  
  const DISTANCE_THRESHOLD_M = 50 // 50 meters
  const TIME_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
  
  const historyRecords = validPositions.filter(p => {
    const last = lastPosMap.get(p.device_id)
    if (!last) return true // First record for this device
    
    // Calculate distance from last recorded position
    const distance = haversineDistance(
      last.latitude, last.longitude,
      p.latitude!, p.longitude!
    )
    
    // Calculate time since last record
    const timeDiff = Date.now() - new Date(last.recorded_at).getTime()
    
    // Record if moved >50m OR >5 minutes elapsed
    return distance > DISTANCE_THRESHOLD_M || timeDiff > TIME_THRESHOLD_MS
  }).map(p => ({
    device_id: p.device_id,
    latitude: p.latitude,
    longitude: p.longitude,
    speed: p.speed,
    heading: p.heading,
    battery_percent: p.battery_percent,
    ignition_on: p.ignition_on,
    ignition_confidence: p.ignition_confidence || null,
    ignition_detection_method: p.ignition_detection_method || null,
    gps_time: p.gps_time
  }))

  console.log(`Smart history: ${historyRecords.length}/${validPositions.length} positions recorded`)

  for (let i = 0; i < historyRecords.length; i += BATCH_SIZE) {
    const batch = historyRecords.slice(i, i + BATCH_SIZE)
    await supabase.from('position_history').insert(batch)
  }

  // ============================================
  // PROACTIVE EVENT DETECTION & ALERTING
  // ============================================
  const ALERT_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes
  const recentCutoff = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString()
  
  // Fetch previous ignition states and speeds for change detection
  const { data: prevPositions } = await supabase
    .from('vehicle_positions')
    .select('device_id, ignition_on, speed')
    .in('device_id', positions.map(p => p.device_id))
  
  const prevIgnitionMap = new Map<string, boolean | null>(
    (prevPositions || []).map((p: any) => [p.device_id, p.ignition_on])
  )
  
  const prevSpeedMap = new Map<string, number | null>(
    (prevPositions || []).map((p: any) => [p.device_id, p.speed])
  )
  
  const eventsToInsert: Array<{
    device_id: string;
    event_type: string;
    severity: string;
    title: string;
    message: string;
    metadata: Record<string, unknown>;
  }> = []

  for (const pos of positions) {
    // 1. OVERSPEEDING DETECTION (speed > 120 km/h)
    // Note: pos.speed is now in km/h (normalized)
    if (pos.speed > 120 && pos.is_overspeeding) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'overspeeding',
        severity: 'critical',
        title: 'High Speed Alert',
        message: `Vehicle traveling at ${Math.round(pos.speed)} km/h`,
        metadata: { 
          speed: pos.speed, 
          lat: pos.latitude, 
          lon: pos.longitude,
          detected_by: 'gps-data'
        }
      })
    }

    // 2. CRITICAL BATTERY (< 10%)
    if (pos.battery_percent && pos.battery_percent < 10) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'critical_battery',
        severity: 'critical',
        title: 'Critical Battery Level',
        message: `Battery at ${pos.battery_percent}% - immediate attention required`,
        metadata: { battery: pos.battery_percent, detected_by: 'gps-data' }
      })
    }
    // 3. LOW BATTERY WARNING (10-20%)
    else if (pos.battery_percent && pos.battery_percent < 20) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'low_battery',
        severity: 'warning',
        title: 'Low Battery Warning',
        message: `Battery level at ${pos.battery_percent}%`,
        metadata: { battery: pos.battery_percent, detected_by: 'gps-data' }
      })
    }

    // 4. IGNITION ON DETECTION (state change from off -> on)
    const prevIgnition = prevIgnitionMap.get(pos.device_id)
    if (pos.ignition_on === true && prevIgnition === false) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'ignition_on',
        severity: 'info',
        title: 'Engine Started',
        message: 'Vehicle engine has been turned on',
        metadata: { 
          lat: pos.latitude, 
          lon: pos.longitude, 
          detected_by: 'gps-data' 
        }
      })
    }

    // 5. VEHICLE MOVING DETECTION (speed transitions from <=5 to >5 km/h)
    // This detects when vehicle actually starts moving, not just when ignition turns on
    const prevSpeed = prevSpeedMap.get(pos.device_id) ?? null
    const movementThreshold = 5 // km/h
    if (pos.ignition_on === true && 
        pos.speed !== null && pos.speed > movementThreshold && 
        (prevSpeed === null || prevSpeed <= movementThreshold)) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'vehicle_moving',
        severity: 'info',
        title: 'Vehicle Started Moving',
        message: `Vehicle is now moving at ${Math.round(pos.speed)} km/h`,
        metadata: { 
          speed: pos.speed,
          previous_speed: prevSpeed,
          lat: pos.latitude, 
          lon: pos.longitude, 
          detected_by: 'gps-data' 
        }
      })
    }

    // 6. IGNITION OFF DETECTION (state change from on -> off)
    if (pos.ignition_on === false && prevIgnition === true) {
      eventsToInsert.push({
        device_id: pos.device_id,
        event_type: 'ignition_off',
        severity: 'info',
        title: 'Engine Stopped',
        message: 'Vehicle engine has been turned off',
        metadata: { 
          lat: pos.latitude, 
          lon: pos.longitude, 
          detected_by: 'gps-data' 
        }
      })
    }
  }

  // De-duplicate: Check if same event was triggered recently (last 30 minutes)
  if (eventsToInsert.length > 0) {
    const eventDeviceIds = eventsToInsert.map(e => e.device_id)
    
    const { data: recentEvents } = await supabase
      .from('proactive_vehicle_events')
      .select('device_id, event_type')
      .in('device_id', eventDeviceIds)
      .gte('created_at', recentCutoff)

    const recentEventKeys = new Set(
      (recentEvents || []).map((e: any) => `${e.device_id}-${e.event_type}`)
    )

    const newEvents = eventsToInsert.filter(
      e => !recentEventKeys.has(`${e.device_id}-${e.event_type}`)
    )

    if (newEvents.length > 0) {
      console.log(`Inserting ${newEvents.length} proactive events (${eventsToInsert.length - newEvents.length} duplicates filtered)`)
      const { error: eventError } = await supabase
        .from('proactive_vehicle_events')
        .insert(newEvents)
      
      if (eventError) {
        console.error('Failed to insert proactive events:', eventError)
      }
    }
  }
}

// Get ALL device IDs from database (paginated to handle 600+ vehicles)
async function getDeviceIdsFromDb(supabase: any): Promise<string[]> {
  const allDeviceIds: string[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  
  while (true) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('device_id')
      .range(offset, offset + PAGE_SIZE - 1)
    
    if (error || !data || data.length === 0) break
    
    allDeviceIds.push(...data.map((d: any) => d.device_id))
    
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  
  return allDeviceIds
}

// Get all device IDs from querymonitorlist
async function getAllDeviceIds(supabase: any, proxyUrl: string, token: string, serverid: string, username: string): Promise<string[]> {
  // First try to get from database (much faster)
  const dbDevices = await getDeviceIdsFromDb(supabase)
  if (dbDevices.length > 0) {
    console.log('Using device IDs from database:', dbDevices.length)
    return dbDevices
  }
  
  // Fallback to API call - MUST include serverid
  let gps51Result
  try {
    gps51Result = await callGps51(proxyUrl, 'querymonitorlist', token, serverid, { username }, supabase)
  } catch (error) {
    console.error('Failed to call querymonitorlist:', error)
    return []
  }
  
  if (!gps51Result || !gps51Result.result) {
    console.error('Empty response from querymonitorlist')
    return []
  }
  
  const result = gps51Result.result
  if (result.status !== 0 || !result.groups) {
    console.error('Failed to fetch device list:', result)
    return []
  }

  const allDevices = result.groups.flatMap((g: any) => g.devices || [])
  await syncVehicles(supabase, allDevices)
  
  return allDevices.map((d: any) => d.deviceid)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let supabase
  try {
    supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    if (!supabase) {
      throw new Error('Failed to create Supabase client')
    }
  } catch (clientError) {
    const errorMsg = clientError instanceof Error ? clientError.message : 'Failed to initialize Supabase client'
    console.error('[gps-data] Supabase client error:', errorMsg)
    return new Response(JSON.stringify({ error: errorMsg }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }

  try {
    let requestBody
    try {
      requestBody = await req.json()
    } catch (jsonError) {
      const errorMsg = jsonError instanceof Error ? jsonError.message : 'Invalid JSON in request body'
      console.error('[gps-data] JSON parse error:', errorMsg)
      return new Response(JSON.stringify({ error: errorMsg }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }
    
    const { action, body_payload, use_cache = true } = requestBody || {}
    
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret')

    // Get valid token - now includes serverid
    const { token, username, serverid } = await getValidGps51Token(supabase)
    console.log(`Token retrieved: serverid=${serverid}, username=${username}`)

    // For lastposition, check cache first
    if (action === 'lastposition' && use_cache) {
      const cached = await getCachedPositions(supabase)
      if (cached && cached.length > 0) {
        console.log('Returning cached positions:', cached.length)
        return new Response(JSON.stringify({ 
          data: { records: cached, fromCache: true } 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Build request body
    let finalBody = body_payload || {}
    
    if (action === 'querymonitorlist') {
      finalBody = { username, ...finalBody }
    }
    
    // For lastposition, we MUST provide device IDs and lastquerypositiontime per GPS51 spec
    if (action === 'lastposition') {
      let deviceIds = finalBody.deviceids || []
      
      // If no device IDs provided, fetch them from querymonitorlist first
      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        console.log('Fetching device IDs from querymonitorlist...')
        deviceIds = await getAllDeviceIds(supabase, DO_PROXY_URL, token, serverid, username)
        console.log('Found device IDs:', deviceIds.length)
      }
      
      // CRITICAL: GPS51 requires deviceids as array AND lastquerypositiontime as number
      finalBody = { 
        ...finalBody, 
        deviceids: deviceIds,
        lastquerypositiontime: finalBody.lastquerypositiontime ?? 0
      }
    }

    // Call GPS51 API - now includes serverid in URL query (with centralized rate limiting)
    let gps51Result
    try {
      gps51Result = await callGps51(DO_PROXY_URL, action, token, serverid, finalBody, supabase)
    } catch (apiError) {
      const errorMsg = apiError instanceof Error ? apiError.message : String(apiError || 'GPS51 API call failed')
      console.error('[gps-data] GPS51 API call error:', errorMsg)
      throw new Error(`GPS51 API error: ${errorMsg}`)
    }
    
    // Handle null/undefined response
    if (!gps51Result) {
      throw new Error('Empty response from GPS51 API call')
    }
    
    if (!gps51Result.result) {
      throw new Error('GPS51 API returned no result data')
    }
    
    const apiResponse = gps51Result.result
    const duration = gps51Result.duration || 0

    // Ensure apiResponse is an object with safe property access
    if (typeof apiResponse !== 'object' || apiResponse === null) {
      throw new Error(`GPS51 API returned invalid response type: ${typeof apiResponse}`)
    }

    // Safely access status property
    const responseStatus = (apiResponse && typeof apiResponse === 'object' && 'status' in apiResponse) 
      ? (apiResponse.status ?? 0) 
      : 0

    // Log the API call
    await logApiCall(supabase, action, finalBody, responseStatus, apiResponse, null, duration)

    // Check for token refresh errors (only if status exists and is a number)
    if (typeof responseStatus === 'number' && TOKEN_REFRESH_ERRORS.includes(responseStatus)) {
      throw new Error(`Token error ${responseStatus}: Admin refresh required`)
    }

    // Sync data to database based on action
    if (action === 'querymonitorlist' && apiResponse.groups) {
      const allDevices = apiResponse.groups.flatMap((g: any) => g.devices || [])
      await syncVehicles(supabase, allDevices)
    }
    
    if (action === 'lastposition' && apiResponse.records && apiResponse.records.length > 0) {
      console.log('Syncing positions:', apiResponse.records.length)
      await syncPositions(supabase, apiResponse.records)
    }

    return new Response(JSON.stringify({ data: apiResponse }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error')
    console.error('GPS Data Error:', message, error)
    
    // Log error (wrap in try-catch to prevent secondary errors)
    try {
      await logApiCall(supabase, 'error', null, 0, null, message, 0)
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }

    return new Response(JSON.stringify({ error: message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
