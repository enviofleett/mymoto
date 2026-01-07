import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Get valid token, auto-refresh if expired
async function getValidToken(supabase: any): Promise<{ token: string; username: string }> {
  const { data: tokenData, error } = await supabase
    .from('app_settings')
    .select('value, expires_at, metadata')
    .eq('key', 'gps_token')
    .maybeSingle()

  if (error) throw new Error(`Token fetch error: ${error.message}`)
  if (!tokenData?.value) throw new Error('No GPS token found. Admin login required.')

  // Check if token is expired
  if (tokenData.expires_at) {
    const expiresAt = new Date(tokenData.expires_at)
    if (new Date() >= expiresAt) {
      throw new Error('Token expired. Admin refresh required.')
    }
  }

  return {
    token: tokenData.value,
    username: tokenData.metadata?.username || ''
  }
}

// Check if cached data is still valid
async function getCachedPositions(supabase: any): Promise<any[] | null> {
  const { data, error } = await supabase
    .from('vehicle_positions')
    .select('*, cached_at')
    .limit(1)

  if (error || !data?.length) return null

  const cachedAt = new Date(data[0].cached_at)
  if (Date.now() - cachedAt.getTime() > CACHE_TTL_MS) return null

  // Get all cached positions
  const { data: allPositions } = await supabase
    .from('vehicle_positions')
    .select('*')

  return allPositions
}

// Parse ignition status from strstatus
function parseIgnition(strstatus: string | null): boolean {
  if (!strstatus) return false
  return strstatus.toUpperCase().includes('ACC ON')
}

// Determine if vehicle is online based on updatetime
function isOnline(updateTime: number | null): boolean {
  if (!updateTime) return false
  const lastUpdate = new Date(updateTime)
  return Date.now() - lastUpdate.getTime() < OFFLINE_THRESHOLD_MS
}

// Log API call
async function logApiCall(supabase: any, action: string, requestBody: any, responseStatus: number, responseBody: any, errorMessage: string | null, durationMs: number) {
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

// Call GPS51 API via proxy
async function callGps51(proxyUrl: string, action: string, token: string, body: any): Promise<any> {
  const startTime = Date.now()
  const targetUrl = `https://api.gps51.com/openapi?action=${action}&token=${token}`
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl,
      method: 'POST',
      data: body
    })
  })

  const result = await response.json()
  const duration = Date.now() - startTime
  
  return { result, duration }
}

// Sync vehicles from querymonitorlist - batch insert
async function syncVehicles(supabase: any, devices: any[]) {
  const vehicleData = devices.map(device => ({
    device_id: device.deviceid,
    device_name: device.devicename || device.deviceid,
    group_id: device.groupid,
    group_name: device.groupname,
    device_type: device.devicetype,
    sim_number: device.simnumber,
    last_synced_at: new Date().toISOString()
  }))
  
  // Batch upsert in chunks
  for (let i = 0; i < vehicleData.length; i += BATCH_SIZE) {
    const batch = vehicleData.slice(i, i + BATCH_SIZE)
    await supabase.from('vehicles').upsert(batch, { onConflict: 'device_id' })
  }
}

// Sync positions from lastposition - batch insert
async function syncPositions(supabase: any, records: any[]) {
  const now = new Date().toISOString()
  
  const positions = records.map(record => ({
    device_id: record.deviceid,
    latitude: record.callat && record.callat !== 0 ? record.callat : null,
    longitude: record.callon && record.callon !== 0 ? record.callon : null,
    speed: record.speed || 0,
    heading: record.heading,
    altitude: record.altitude,
    battery_percent: record.voltagepercent,
    ignition_on: parseIgnition(record.strstatus),
    is_online: isOnline(record.updatetime),
    is_overspeeding: record.currentoverspeedstate === 1,
    total_mileage: record.totaldistance,
    status_text: record.strstatus,
    gps_time: record.updatetime ? new Date(record.updatetime).toISOString() : null,
    cached_at: now
  }))

  // Batch upsert positions
  for (let i = 0; i < positions.length; i += BATCH_SIZE) {
    const batch = positions.slice(i, i + BATCH_SIZE)
    await supabase.from('vehicle_positions').upsert(batch, { 
      onConflict: 'device_id',
      ignoreDuplicates: false 
    })
  }

  // Batch insert history (only valid positions)
  const historyRecords = positions
    .filter(p => p.latitude && p.longitude)
    .map(p => ({
      device_id: p.device_id,
      latitude: p.latitude,
      longitude: p.longitude,
      speed: p.speed,
      heading: p.heading,
      battery_percent: p.battery_percent,
      ignition_on: p.ignition_on,
      gps_time: p.gps_time
    }))

  for (let i = 0; i < historyRecords.length; i += BATCH_SIZE) {
    const batch = historyRecords.slice(i, i + BATCH_SIZE)
    await supabase.from('position_history').insert(batch)
  }
}

// Get device IDs from database (faster than API call)
async function getDeviceIdsFromDb(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('vehicles').select('device_id').limit(500)
  return data?.map((d: any) => d.device_id) || []
}

// Get all device IDs from querymonitorlist
async function getAllDeviceIds(supabase: any, proxyUrl: string, token: string, username: string): Promise<string[]> {
  // First try to get from database (much faster)
  const dbDevices = await getDeviceIdsFromDb(supabase)
  if (dbDevices.length > 0) {
    console.log('Using device IDs from database:', dbDevices.length)
    return dbDevices
  }
  
  // Fallback to API call
  const { result } = await callGps51(proxyUrl, 'querymonitorlist', token, { username })
  
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { action, body_payload, use_cache = true } = await req.json()
    
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret')

    // Get valid token
    const { token, username } = await getValidToken(supabase)

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
    
    // For lastposition, we MUST provide device IDs - GPS51 doesn't return positions without them
    if (action === 'lastposition') {
      let deviceIds = finalBody.deviceids || []
      
      // If no device IDs provided, fetch them from querymonitorlist first
      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        console.log('Fetching device IDs from querymonitorlist...')
        deviceIds = await getAllDeviceIds(supabase, DO_PROXY_URL, token, username)
        console.log('Found device IDs:', deviceIds.length)
      }
      
      // Keep as array - GPS51 API accepts array format
      finalBody = { ...finalBody, deviceids: deviceIds }
    }

    // Call GPS51 API
    const { result: apiResponse, duration } = await callGps51(DO_PROXY_URL, action, token, finalBody)
    
    // Handle null/undefined response
    if (!apiResponse) {
      throw new Error('Empty response from GPS51 API')
    }

    // Log the API call
    await logApiCall(supabase, action, finalBody, apiResponse.status ?? 0, apiResponse, null, duration)

    // Check for token refresh errors
    if (TOKEN_REFRESH_ERRORS.includes(apiResponse.status)) {
      throw new Error(`Token error ${apiResponse.status}: Admin refresh required`)
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
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('GPS Data Error:', message)
    
    // Log error
    await logApiCall(supabase, 'error', null, 0, null, message, 0)

    return new Response(JSON.stringify({ error: message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
