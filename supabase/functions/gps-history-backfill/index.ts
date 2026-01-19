import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 100 // Insert records in batches

interface BackfillRequest {
  device_id: string
  start_date: string  // ISO date string
  end_date: string    // ISO date string
  force_overwrite?: boolean  // If true, overwrites existing records
}

interface TrackRecord {
  latitude: number
  longitude: number
  speed: number
  heading: number
  altitude: number
  gps_time: string
  battery_percent: number | null
  ignition_on: boolean
}

// Using shared GPS51 client for rate limiting

// Parse ignition status using JT808 status bit field (more reliable than string parsing)
function parseIgnition(status: number | null, strstatus: string | null): boolean {
  // ✅ FIX: Use JT808 status bit field (bit 0 = ACC status)
  // This is the authoritative source per GPS51 API spec
  if (status !== null && status !== undefined) {
    const ACC_BIT_MASK = 0x01; // Bit 0 indicates ACC (ignition) status
    return (status & ACC_BIT_MASK) !== 0;
  }

  // Fallback to string parsing only if status field unavailable
  // (for backwards compatibility with old data)
  if (!strstatus) return false;
  return strstatus.toUpperCase().includes('ACC ON');
}

// Format date for GPS51 API (YYYY-MM-DD HH:MM:SS)
function formatDateForGps51(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19)
}

// Fetch track history from GPS51
async function fetchTrackHistory(
  supabase: any,
  proxyUrl: string,
  token: string,
  serverid: string,
  deviceId: string,
  startDate: Date,
  endDate: Date
): Promise<TrackRecord[]> {
  console.log(`Fetching track history for ${deviceId} from ${startDate.toISOString()} to ${endDate.toISOString()}`)
  
  // GPS51 querytrack action expects starttime/endtime in specific format
  // Using shared client for centralized rate limiting
  const result = await callGps51WithRateLimit(supabase, proxyUrl, 'querytrack', token, serverid, {
    deviceid: deviceId,
    starttime: formatDateForGps51(startDate),
    endtime: formatDateForGps51(endDate),
    coordsys: 'wgs84'  // Request WGS84 coordinates
  })
  
  console.log('GPS51 querytrack response status:', result?.status)
  
  if (result?.status !== 0) {
    console.error('GPS51 querytrack error:', result?.message || result)
    throw new Error(`GPS51 API error: ${result?.message || 'Unknown error'} (status: ${result?.status})`)
  }
  
  const records = result?.data?.records || result?.records || []
  console.log(`Received ${records.length} track records from GPS51`)
  
  // Map GPS51 track data to our format
  return records.map((record: any) => {
    // GPS51 track records have various field names depending on API version
    const lat = record.callat || record.lat || record.latitude
    const lon = record.callon || record.lon || record.lng || record.longitude
    const gpsTime = record.gpstime || record.updatetime || record.time
    
    return {
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      speed: parseFloat(record.speed || 0),
      heading: parseFloat(record.heading || record.direction || 0),
      altitude: parseFloat(record.altitude || 0),
      gps_time: new Date(gpsTime).toISOString(),
      battery_percent: record.voltagepercent > 0 ? record.voltagepercent : null,
      ignition_on: parseIgnition(record.status, record.strstatus)
    }
  }).filter((r: TrackRecord) => r.latitude && r.longitude && !isNaN(r.latitude) && !isNaN(r.longitude))
}

// Insert track records into position_history
async function insertPositionHistory(
  supabase: any,
  deviceId: string,
  records: TrackRecord[],
  forceOverwrite: boolean
): Promise<{ inserted: number; skipped: number }> {
  if (records.length === 0) {
    return { inserted: 0, skipped: 0 }
  }
  
  let inserted = 0
  let skipped = 0
  
  // Get existing records in date range to avoid duplicates
  const minTime = records.reduce((min, r) => r.gps_time < min ? r.gps_time : min, records[0].gps_time)
  const maxTime = records.reduce((max, r) => r.gps_time > max ? r.gps_time : max, records[0].gps_time)
  
  let existingTimes = new Set<string>()
  
  if (!forceOverwrite) {
    const { data: existing } = await supabase
      .from('position_history')
      .select('gps_time')
      .eq('device_id', deviceId)
      .gte('gps_time', minTime)
      .lte('gps_time', maxTime)
    
    if (existing) {
      existingTimes = new Set(existing.map((e: any) => e.gps_time))
    }
    console.log(`Found ${existingTimes.size} existing records in date range`)
  }
  
  // Filter out duplicates and prepare records
  const newRecords = records
    .filter(r => forceOverwrite || !existingTimes.has(r.gps_time))
    .map(r => ({
      device_id: deviceId,
      latitude: r.latitude,
      longitude: r.longitude,
      speed: r.speed,
      heading: r.heading,
      battery_percent: r.battery_percent,
      ignition_on: r.ignition_on,
      gps_time: r.gps_time,
      recorded_at: new Date().toISOString()
    }))
  
  skipped = records.length - newRecords.length
  
  // Insert in batches
  for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
    const batch = newRecords.slice(i, i + BATCH_SIZE)
    
    if (forceOverwrite) {
      // Use upsert if force overwrite
      const { error } = await supabase
        .from('position_history')
        .upsert(batch, { 
          onConflict: 'device_id,gps_time',
          ignoreDuplicates: false 
        })
      
      if (error) {
        console.error(`Batch upsert error at ${i}:`, error)
        // Fall back to insert
        await supabase.from('position_history').insert(batch)
      }
    } else {
      const { error } = await supabase
        .from('position_history')
        .insert(batch)
      
      if (error) {
        console.error(`Batch insert error at ${i}:`, error)
      }
    }
    
    inserted += batch.length
  }
  
  return { inserted, skipped }
}

// Process trips from position history (detect start/stop patterns)
async function detectAndInsertTrips(
  supabase: any,
  deviceId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Fetch position history for the date range
  const { data: positions, error } = await supabase
    .from('position_history')
    .select('*')
    .eq('device_id', deviceId)
    .gte('gps_time', startDate.toISOString())
    .lte('gps_time', endDate.toISOString())
    .order('gps_time', { ascending: true })
  
  if (error || !positions || positions.length < 2) {
    console.log('Not enough positions to detect trips')
    return 0
  }
  
  console.log(`Analyzing ${positions.length} positions for trip detection...`)
  
  const trips: any[] = []
  let tripStart: any = null
  let lastMovingPosition: any = null
  const STOP_THRESHOLD_MS = 300000 // 5 minutes stationary = trip end
  const MIN_TRIP_DISTANCE_KM = 0.1 // Minimum 100m for a valid trip
  
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const isMoving = pos.speed > 0 || pos.ignition_on
    
    if (isMoving && !tripStart) {
      // Trip started
      tripStart = pos
      lastMovingPosition = pos
    } else if (isMoving && tripStart) {
      // Still moving
      lastMovingPosition = pos
    } else if (!isMoving && tripStart && lastMovingPosition) {
      // Check if stopped long enough to end trip
      const stopDuration = new Date(pos.gps_time).getTime() - new Date(lastMovingPosition.gps_time).getTime()
      
      if (stopDuration >= STOP_THRESHOLD_MS) {
        // Calculate trip distance
        const distance = haversineDistance(
          tripStart.latitude, tripStart.longitude,
          lastMovingPosition.latitude, lastMovingPosition.longitude
        )
        
        if (distance >= MIN_TRIP_DISTANCE_KM) {
          const duration = (new Date(lastMovingPosition.gps_time).getTime() - new Date(tripStart.gps_time).getTime()) / 1000
          
          trips.push({
            device_id: deviceId,
            start_time: tripStart.gps_time,
            end_time: lastMovingPosition.gps_time,
            start_latitude: tripStart.latitude,
            start_longitude: tripStart.longitude,
            end_latitude: lastMovingPosition.latitude,
            end_longitude: lastMovingPosition.longitude,
            distance_km: distance,
            duration_seconds: Math.round(duration),
            avg_speed: duration > 0 ? (distance / (duration / 3600)) : 0,
            max_speed: 0 // Would need to track during trip
          })
        }
        
        tripStart = null
        lastMovingPosition = null
      }
    }
  }
  
  // Handle trip in progress at end of data
  if (tripStart && lastMovingPosition) {
    const distance = haversineDistance(
      tripStart.latitude, tripStart.longitude,
      lastMovingPosition.latitude, lastMovingPosition.longitude
    )
    
    if (distance >= MIN_TRIP_DISTANCE_KM) {
      const duration = (new Date(lastMovingPosition.gps_time).getTime() - new Date(tripStart.gps_time).getTime()) / 1000
      
      trips.push({
        device_id: deviceId,
        start_time: tripStart.gps_time,
        end_time: lastMovingPosition.gps_time,
        start_latitude: tripStart.latitude,
        start_longitude: tripStart.longitude,
        end_latitude: lastMovingPosition.latitude,
        end_longitude: lastMovingPosition.longitude,
        distance_km: distance,
        duration_seconds: Math.round(duration),
        avg_speed: duration > 0 ? (distance / (duration / 3600)) : 0,
        max_speed: 0
      })
    }
  }
  
  console.log(`Detected ${trips.length} trips from position history`)
  
  // Insert trips (avoid duplicates based on start_time)
  if (trips.length > 0) {
    for (const trip of trips) {
      const { error } = await supabase
        .from('vehicle_trips')
        .upsert(trip, { 
          onConflict: 'device_id,start_time',
          ignoreDuplicates: true 
        })
      
      if (error) {
        console.error('Trip insert error:', error)
      }
    }
  }
  
  return trips.length
}

// Haversine distance calculation (km)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request
    const body = await req.json()
    const { 
      device_id, 
      start_date, 
      end_date, 
      force_overwrite = false,
      detect_trips = true,
      days_back  // Alternative: specify number of days back from today
    } = body as BackfillRequest & { detect_trips?: boolean; days_back?: number }

    // Validate inputs
    if (!device_id) {
      return new Response(JSON.stringify({ error: 'device_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Calculate date range
    let startDate: Date
    let endDate: Date

    if (days_back) {
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - days_back)
    } else if (start_date && end_date) {
      startDate = new Date(start_date)
      endDate = new Date(end_date)
    } else {
      // Default: last 7 days
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)
    }

    // Validate date range (max 30 days to avoid API limits)
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 30) {
      return new Response(JSON.stringify({ 
        error: 'Date range cannot exceed 30 days. Use multiple requests for longer periods.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Backfill request: device=${device_id}, from=${startDate.toISOString()}, to=${endDate.toISOString()}`)

    // Verify device exists
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('device_id, device_name')
      .eq('device_id', device_id)
      .maybeSingle()

    if (vehicleError || !vehicle) {
      return new Response(JSON.stringify({ 
        error: `Vehicle not found: ${device_id}` 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get GPS token and proxy URL (using shared client)
    const { token, serverid } = await getValidGps51Token(supabase)
    const proxyUrl = Deno.env.get('DO_PROXY_URL')
    
    if (!proxyUrl) {
      throw new Error('DO_PROXY_URL not configured')
    }

    // Fetch track history from GPS51 (with centralized rate limiting)
    const trackRecords = await fetchTrackHistory(supabase, proxyUrl, token, serverid, device_id, startDate, endDate)

    if (trackRecords.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No track data found for the specified date range',
        device_id,
        device_name: vehicle.device_name,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        records_found: 0,
        records_inserted: 0,
        records_skipped: 0,
        trips_detected: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Insert into position_history
    const { inserted, skipped } = await insertPositionHistory(supabase, device_id, trackRecords, force_overwrite)

    // Optionally detect and insert trips
    let tripsDetected = 0
    if (detect_trips && inserted > 0) {
      tripsDetected = await detectAndInsertTrips(supabase, device_id, startDate, endDate)
    }

    console.log(`Backfill complete: ${inserted} inserted, ${skipped} skipped, ${tripsDetected} trips detected`)

    return new Response(JSON.stringify({
      success: true,
      message: `Backfill completed successfully`,
      device_id,
      device_name: vehicle.device_name,
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      records_found: trackRecords.length,
      records_inserted: inserted,
      records_skipped: skipped,
      trips_detected: tripsDetected
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Backfill error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
