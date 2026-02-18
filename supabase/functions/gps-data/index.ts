import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"
import { normalizeVehicleTelemetry, detectIgnitionV2, type Gps51RawData } from "../_shared/telemetry-normalizer.ts"
import { getFeatureFlag } from "../_shared/feature-flags.ts"
import { calculateDaysOffline } from "../_shared/vehicle-hibernation.ts"

declare const Deno: any;

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
  const vehicleData = devices.map(device => ({
    device_id: device.deviceid,
    device_name: device.devicename || device.deviceid,
    group_id: device.groupid,
    group_name: device.groupname,
    device_type: device.devicetype,
    sim_number: device.simnumber,
    gps_owner: device.creater || null,  // GPS51 account owner
    last_synced_at: new Date().toISOString()
  }))
  
  // Batch upsert in chunks
  for (let i = 0; i < vehicleData.length; i += BATCH_SIZE) {
    const batch = vehicleData.slice(i, i + BATCH_SIZE)
    await supabase.from('vehicles').upsert(batch, { onConflict: 'device_id' })
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

async function syncPositions(supabase: any, records: any[]): Promise<any[]> {
  const now = new Date().toISOString()
  
  const shadowLogs: Array<Record<string, any>> = []

  const positions = records.map(record => {
    // Normalize telemetry using centralized normalizer
    // This ensures JT808 status bits are properly detected and confidence is calculated
    const normalized = normalizeVehicleTelemetry(record as Gps51RawData, {
      offlineThresholdMs: OFFLINE_THRESHOLD_MS,
    });
    
    // Log low-confidence ignition detection only if we expected to have data but don't
    // Don't warn for devices that legitimately have no ACC data (status=0, no ACC in strstatus, no speed)
    // Only warn if we have some signals but confidence is still low (indicates a problem)
    const hasStatusData = record.status !== null && record.status !== undefined;
    const hasStrStatusData = record.strstatus || record.strstatusen;
    const hasSpeedData = record.speed !== null && record.speed !== undefined && (record.speed > 0 || normalized.speed_kmh > 0);
    const hasAnyData = hasStatusData || hasStrStatusData || hasSpeedData;
    
    // Only warn if:
    // 1. We have some data (status, strstatus, or speed)
    // 2. Confidence is low (< 0.5)
    // 3. Method is not 'unknown' (unknown means no data at all, which is OK)
    // This prevents warnings for devices that simply don't support ACC detection
    if (normalized.ignition_confidence !== undefined && 
        normalized.ignition_confidence < 0.5 && 
        normalized.ignition_detection_method !== 'unknown' &&
        hasAnyData) {
      console.warn(`[syncPositions] Low ignition confidence (${normalized.ignition_confidence.toFixed(2)}) for device=${record.deviceid}, method=${normalized.ignition_detection_method}, status=${record.status}, strstatus=${record.strstatus}`);
    }
    
    // Debug: Log if speed is unusually high after normalization (helps identify GPS data quality issues)
    // Note: 300 km/h is the clamped maximum, so speeds at exactly 300 are expected for very high raw values
    if (normalized.speed_kmh > 200 && normalized.speed_kmh < 300) {
      console.log(`[syncPositions] High speed detected: device=${record.deviceid}, raw_speed=${record.speed}, normalized=${normalized.speed_kmh} km/h`);
    }
    
    // Note: Speed normalization is handled by normalizeSpeed() in telemetry-normalizer.ts
    // No need for additional correction here - the normalized value is already correct
    // (300 km/h is the clamped maximum for safety, not an error)
    
    // FLEET-SCALE: Determine sync priority based on vehicle movement
    // Moving vehicles (>3 km/h) get high priority for more frequent syncs
    const syncPriority = normalized.is_moving ? 'high' : 'normal';

    // Phase 3 (shadow mode): compute v2 ignition and keep ONLY mismatches for logging later.
    // No behavior change: we do not override ignition_on in vehicle_positions.
    try {
      const v2 = detectIgnitionV2(record as Gps51RawData, normalized.speed_kmh)
      if (v2.ignition_on !== normalized.ignition_on) {
        shadowLogs.push({
          device_id: normalized.vehicle_id,
          gps_time: normalized.last_updated_at,
          speed_kmh: normalized.speed_kmh,
          status_raw: record.status ?? null,
          strstatus: record.strstatus ?? record.strstatusen ?? null,
          old_ignition_on: normalized.ignition_on,
          new_ignition_on: v2.ignition_on,
          new_confidence: v2.confidence,
          new_method: v2.detection_method,
          note: 'v1_vs_v2_mismatch'
        })
      }
    } catch {
      // ignore v2 failures (shadow only)
    }

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
      // gps_time = "last update" (GPS51 updatetime/arrivedtime), used for freshness
      gps_time: normalized.last_updated_at,
      // gps_fix_time = true GPS fix time (GPS51 validpoistiontime) when available
      gps_fix_time: normalized.gps_fix_at ?? null,
      location_source: (record.gotsrc ?? null),
      gps_valid_num: (record.gpsvalidnum ?? null),
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

  const onlinePositions = positions.filter(p => p.is_online)
  if (onlinePositions.length > 0) {
    const deviceIds = onlinePositions.map(p => p.device_id)
    const { data: existingVehicles } = await supabase
      .from("vehicles")
      .select("device_id, vehicle_status, last_online_at")
      .in("device_id", deviceIds)

    const existingMap = new Map<string, { device_id: string; vehicle_status: string | null; last_online_at: string | null }>()
    if (existingVehicles) {
      for (const v of existingVehicles) {
        existingMap.set(v.device_id, {
          device_id: v.device_id,
          vehicle_status: v.vehicle_status ?? null,
          last_online_at: v.last_online_at ?? null
        })
      }
    }

    const nowDate = new Date()
    const updates: any[] = []
    const reactivationLogs: any[] = []

    for (const pos of onlinePositions) {
      updates.push({
        device_id: pos.device_id,
        vehicle_status: "active",
        last_online_at: pos.gps_time,
        hibernated_at: null
      })

      const existing = existingMap.get(pos.device_id)
      if (existing && existing.vehicle_status === "hibernated") {
        const daysOffline = calculateDaysOffline(existing.last_online_at, nowDate)
        reactivationLogs.push({
          device_id: pos.device_id,
          event_type: "reactivated",
          event_at: nowDate.toISOString(),
          last_online_at: existing.last_online_at,
          days_offline: daysOffline !== null ? Math.floor(daysOffline) : null,
          notes: "reactivated_via_gps_data"
        })
      }
    }

    if (updates.length > 0) {
      await supabase.from("vehicles").upsert(updates, { onConflict: "device_id" })
    }

    if (reactivationLogs.length > 0) {
      await supabase.from("vehicle_hibernation_log").insert(reactivationLogs)
    }
  }

  // Phase 3 (shadow mode): insert ignition mismatch logs (guarded by global flag + per-device allowlist).
  // Default OFF. Also logs only mismatches to keep volume low.
  if (shadowLogs.length > 0) {
    try {
      const { enabled: shadowEnabled } = await getFeatureFlag(supabase, 'new_ignition_detection_shadow')
      if (shadowEnabled) {
        const deviceIds = Array.from(new Set(shadowLogs.map(l => l.device_id)))
        const { data: allowlisted, error: allowErr } = await supabase
          .from('feature_flag_devices')
          .select('device_id')
          .eq('flag_key', 'new_ignition_detection_shadow')
          .eq('enabled', true)
          .in('device_id', deviceIds)

        if (!allowErr && allowlisted?.length) {
          const allowedSet = new Set(allowlisted.map((r: any) => r.device_id))
          const rows = shadowLogs.filter(l => allowedSet.has(l.device_id))
          if (rows.length > 0) {
            await supabase.from('ignition_detection_shadow_logs').insert(rows)
          }
        }
      }
    } catch {
      // Safe: ignore logging failures (table may not exist yet, etc.)
    }
  }

  // SMART HISTORY: Only record if position changed significantly or time elapsed
  const validPositions = positions.filter(p => p.latitude && p.longitude)
  if (validPositions.length === 0) return []
  
  const deviceIds = validPositions.map(p => p.device_id)
  
  // Fetch most recent history record for each device (efficient, per-device)
  const { data: lastPositions } = await supabase
    .rpc('get_last_position_history', { device_ids: deviceIds })
  
  // Build lookup map of last position per device
  const lastPosMap = new Map<string, any>()
  if (lastPositions) {
    for (const pos of lastPositions) {
      if (!lastPosMap.has(pos.device_id)) {
        lastPosMap.set(pos.device_id, pos)
      }
    }
  }
  
  const DISTANCE_THRESHOLD_M = 75 // 75 meters
  const TIME_THRESHOLD_MS = 7 * 60 * 1000 // 7 minutes
  
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
    gps_time: p.gps_time,
    gps_fix_time: (p as any).gps_fix_time ?? null,
    location_source: (p as any).location_source ?? null,
    gps_valid_num: (p as any).gps_valid_num ?? null,
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
  
  // Fetch previous ignition states for change detection
  const { data: prevPositions } = await supabase
    .from('vehicle_positions')
    .select('device_id, ignition_on')
    .in('device_id', positions.map(p => p.device_id))
  
  const prevIgnitionMap = new Map<string, boolean | null>(
    (prevPositions || []).map((p: any) => [p.device_id, p.ignition_on])
  )
  
  const eventsToInsert: Array<{
    device_id: string;
    event_type: string;
    severity: string;
    title: string;
    message: string;
    metadata: Record<string, unknown>;
  }> = []

  // Collect devices that need trip sync (ignition turned off)
  const devicesToSync = new Set<string>()

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

    // 5. IGNITION OFF DETECTION (state change from on -> off)
    if (pos.ignition_on === false && prevIgnition === true) {
      devicesToSync.add(pos.device_id)
      
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

  // Trigger trip sync for devices that just finished a trip (Ignition OFF)
  if (devicesToSync.size > 0) {
    const deviceIds = Array.from(devicesToSync)
    console.log(`[gps-data] Triggering GPS51 trip sync for ${deviceIds.length} devices (ignition OFF detected)`)
    
    // Non-blocking call to sync-gps51-trips
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (supabaseUrl && serviceRoleKey) {
      const now = new Date();
      const begin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const syncUrl = `${supabaseUrl}/functions/v1/sync-gps51-trips`;

      Promise.allSettled(
        deviceIds.map((deviceId) =>
          fetch(syncUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              deviceid: deviceId,
              begintime: begin.toISOString(),
              endtime: now.toISOString(),
            }),
          })
        )
      ).catch(err => {
        console.error(`[gps-data] Failed to trigger GPS51 trip sync: ${err.message}`)
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

  return positions;
}

async function getDeviceIdsFromDb(supabase: any): Promise<string[]> {
  const allDeviceIds: string[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  
  while (true) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("device_id")
      .neq("vehicle_status", "hibernated")
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
    // Phase 2: feature-flagged verbose logging (default OFF)
    const { enabled: verboseLogs } = await getFeatureFlag(supabase, 'sync_logging_verbose')
    const vlog = (...args: any[]) => { if (verboseLogs) console.log(...args) }

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

    vlog('[gps-data] request body keys:', requestBody && typeof requestBody === 'object' ? Object.keys(requestBody) : typeof requestBody)
    
    const { action, body_payload, use_cache = true } = requestBody || {}
    
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret')

    // Get valid token - now includes serverid
    const { token, username, serverid } = await getValidGps51Token(supabase)
    console.log(`Token retrieved: serverid=${serverid}, username=${username}`)

    // DEBUG ACTION: Fetch raw data for specific device
    if (action === 'debug_raw') {
      const deviceName = body_payload?.device_name;
      const deviceId = body_payload?.device_id;
      
      let targetDeviceId = deviceId;
      let vehicles: any[] | null = null;
      
      // Initialize admin client for all debug operations
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      
      if (!targetDeviceId && deviceName) {
         // Use admin client to bypass RLS for debugging lookup

             let query = supabaseAdmin
               .from('vehicles')
               .select('*')
               .limit(50);

             if (deviceName === 'CHECK_SCHEMA') {
             const { data: tables, error: tableError } = await supabaseAdmin
               .from('information_schema.tables')
               .select('*')
               .eq('table_schema', 'public');
               
             return new Response(JSON.stringify({ 
                tables, 
                error: tableError 
             }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          if (deviceName !== 'LIST_ALL') {
                query = query.ilike('device_name', `%${deviceName}%`);
             }
 
             const { data: foundVehicles, error: searchError } = await query;
             vehicles = foundVehicles;
                
              if (searchError) {
                 return new Response(JSON.stringify({ error: 'Search error', details: searchError }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
                
              if (vehicles && vehicles.length > 0) {
           if (vehicles.length > 1) {
             return new Response(JSON.stringify({ 
               error: 'Multiple devices found', 
               candidates: vehicles 
             }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
           }
          targetDeviceId = vehicles[0].device_id;
        }
      }
      
      if (!targetDeviceId) {
            return new Response(JSON.stringify({ 
                error: 'Device not found',
                debug_context: {
                    input_device_name: deviceName,
                    found_vehicles_count: vehicles?.length ?? 0,
                    has_service_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                    supabase_url_set: !!Deno.env.get('SUPABASE_URL')
                }
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
      
      // Call lastposition for this device
      const gps51Result = await callGps51(DO_PROXY_URL, 'lastposition', token, serverid, {
        deviceids: [targetDeviceId],
        lastquerypositiontime: 0
      }, supabase);

      // Fetch DB position for comparison
      const { data: dbPosition } = await supabaseAdmin
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', targetDeviceId)
        .maybeSingle();
      
      // Also normalize it to see what we get
      let normalized = null;
      if (gps51Result?.result?.records?.[0]) {
        normalized = normalizeVehicleTelemetry(gps51Result.result.records[0], {
          offlineThresholdMs: OFFLINE_THRESHOLD_MS,
        });
      }
      
      return new Response(JSON.stringify({ 
        debug_info: {
          targetDeviceId,
          deviceName,
          server_time: new Date().toISOString(),
          offline_threshold_ms: OFFLINE_THRESHOLD_MS
        },
        raw_response: gps51Result,
        normalized_preview: normalized,
        db_position: dbPosition
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

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
    
    let normalizedRecords: any[] = [];
    if (action === 'lastposition' && apiResponse.records && apiResponse.records.length > 0) {
      console.log('Syncing positions:', apiResponse.records.length)
      normalizedRecords = await syncPositions(supabase, apiResponse.records)
    }

    // CRITICAL FIX: Return normalized records if available
    // The frontend expects snake_case keys (device_id) and computed fields (is_online)
    // which are only present in the normalized data, not the raw GPS51 response.
    if (action === 'lastposition' && normalizedRecords.length > 0) {
      return new Response(JSON.stringify({ 
        data: {
          ...apiResponse,
          records: normalizedRecords
        }
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
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
