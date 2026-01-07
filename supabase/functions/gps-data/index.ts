import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CACHE_TTL_MS = 30000 // 30 seconds
const OFFLINE_THRESHOLD_MS = 600000 // 10 minutes
const TOKEN_REFRESH_ERRORS = [9903, 9906]

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

// Sync vehicles from querymonitorlist
async function syncVehicles(supabase: any, devices: any[]) {
  for (const device of devices) {
    await supabase.from('vehicles').upsert({
      device_id: device.deviceid,
      device_name: device.devicename || device.deviceid,
      group_id: device.groupid,
      group_name: device.groupname,
      device_type: device.devicetype,
      sim_number: device.simnumber,
      last_synced_at: new Date().toISOString()
    }, { onConflict: 'device_id' })
  }
}

// Sync positions from lastposition
async function syncPositions(supabase: any, records: any[]) {
  const now = new Date().toISOString()
  
  for (const record of records) {
    const positionData = {
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
    }

    // Upsert to positions cache
    await supabase.from('vehicle_positions').upsert(positionData, { 
      onConflict: 'device_id',
      ignoreDuplicates: false 
    })

    // Also insert to history if position is valid
    if (positionData.latitude && positionData.longitude) {
      await supabase.from('position_history').insert({
        device_id: record.deviceid,
        latitude: positionData.latitude,
        longitude: positionData.longitude,
        speed: positionData.speed,
        heading: positionData.heading,
        battery_percent: positionData.battery_percent,
        ignition_on: positionData.ignition_on,
        gps_time: positionData.gps_time
      })
    }
  }
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

    // For lastposition, check cache first
    if (action === 'lastposition' && use_cache) {
      const cached = await getCachedPositions(supabase)
      if (cached) {
        console.log('Returning cached positions')
        return new Response(JSON.stringify({ 
          data: { records: cached, fromCache: true } 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Get valid token
    const { token, username } = await getValidToken(supabase)

    // Build request body
    let finalBody = body_payload || {}
    if (action === 'querymonitorlist') {
      finalBody = { username, ...finalBody }
    }
    if (action === 'lastposition' && !finalBody.deviceids) {
      finalBody = { deviceids: [], ...finalBody }
    }

    // Call GPS51 API
    const { result: apiResponse, duration } = await callGps51(DO_PROXY_URL, action, token, finalBody)

    // Log the API call
    await logApiCall(supabase, action, finalBody, apiResponse.status ?? 0, apiResponse, null, duration)

    // Check for token refresh errors
    if (TOKEN_REFRESH_ERRORS.includes(apiResponse.status)) {
      throw new Error(`Token error ${apiResponse.status}: Admin refresh required`)
    }

    // Sync data to database based on action
    if (action === 'querymonitorlist' && apiResponse.records) {
      await syncVehicles(supabase, apiResponse.records)
    }
    
    if (action === 'lastposition' && apiResponse.records) {
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
