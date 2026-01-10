import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Check if current time is within active window
function isWithinActiveWindow(
  activeFrom: string | null, 
  activeUntil: string | null, 
  activeDays: number[] | null
): boolean {
  const now = new Date()
  const currentDay = now.getDay() // 0 = Sunday
  
  // Check day of week
  if (activeDays && activeDays.length > 0 && !activeDays.includes(currentDay)) {
    return false
  }
  
  // Check time window
  if (activeFrom && activeUntil) {
    const currentTime = now.toTimeString().slice(0, 5) // "HH:MM"
    const fromTime = activeFrom.slice(0, 5)
    const untilTime = activeUntil.slice(0, 5)
    
    // Handle overnight windows (e.g., 22:00 to 06:00)
    if (fromTime > untilTime) {
      return currentTime >= fromTime || currentTime <= untilTime
    } else {
      return currentTime >= fromTime && currentTime <= untilTime
    }
  }
  
  return true
}

interface Monitor {
  id: string
  device_id: string
  location_id: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  radius_meters: number
  trigger_on: 'enter' | 'exit' | 'both'
  is_active: boolean
  one_time: boolean
  active_from: string | null
  active_until: string | null
  active_days: number[] | null
  expires_at: string | null
  vehicle_inside: boolean
  last_triggered_at: string | null
  trigger_count: number
  created_by: string | null
  geofence_locations?: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
  }
}

interface VehiclePosition {
  device_id: string
  latitude: number
  longitude: number
  speed: number
  gps_time: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    console.log('=== Geofence Check Started ===')
    const startTime = Date.now()
    
    // 1. Get all active monitors that haven't expired
    const { data: monitors, error: monitorError } = await supabase
      .from('geofence_monitors')
      .select(`
        *,
        geofence_locations (
          name,
          latitude,
          longitude,
          radius_meters
        )
      `)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')
    
    if (monitorError) {
      throw new Error(`Failed to fetch monitors: ${monitorError.message}`)
    }
    
    if (!monitors || monitors.length === 0) {
      console.log('No active geofence monitors found')
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active monitors',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`Found ${monitors.length} active monitors`)
    
    // 2. Get unique device IDs from monitors
    const deviceIds = [...new Set(monitors.map((m: Monitor) => m.device_id))]
    
    // 3. Get current positions for these devices
    const { data: positions, error: posError } = await supabase
      .from('vehicle_positions')
      .select('device_id, latitude, longitude, speed, gps_time')
      .in('device_id', deviceIds)
    
    if (posError) {
      throw new Error(`Failed to fetch positions: ${posError.message}`)
    }
    
    // Build position lookup map
    const positionMap = new Map<string, VehiclePosition>()
    for (const pos of (positions || [])) {
      if (pos.latitude && pos.longitude) {
        positionMap.set(pos.device_id, pos)
      }
    }
    
    // Get vehicle names for better messages
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('device_id, device_name')
      .in('device_id', deviceIds)
    
    const vehicleNames = new Map<string, string>()
    for (const v of (vehicles || [])) {
      vehicleNames.set(v.device_id, v.device_name)
    }
    
    // 4. Check each monitor
    const events: any[] = []
    const updates: { id: string; vehicle_inside: boolean; last_checked_at: string; last_triggered_at?: string; trigger_count?: number; is_active?: boolean }[] = []
    const COOLDOWN_MS = 5 * 60 * 1000 // 5 minute cooldown between triggers
    
    for (const monitor of monitors as Monitor[]) {
      const position = positionMap.get(monitor.device_id)
      
      if (!position) {
        console.log(`No position for device ${monitor.device_id}`)
        continue
      }
      
      // Check if within active time window
      if (!isWithinActiveWindow(monitor.active_from, monitor.active_until, monitor.active_days)) {
        console.log(`Monitor ${monitor.id} outside active window, skipping`)
        continue
      }
      
      // Get geofence coordinates (from linked location or inline)
      let gLat: number, gLon: number, gRadius: number, locationName: string
      
      if (monitor.geofence_locations) {
        gLat = monitor.geofence_locations.latitude
        gLon = monitor.geofence_locations.longitude
        gRadius = monitor.geofence_locations.radius_meters
        locationName = monitor.geofence_locations.name
      } else if (monitor.latitude && monitor.longitude && monitor.location_name) {
        gLat = monitor.latitude
        gLon = monitor.longitude
        gRadius = monitor.radius_meters || 500
        locationName = monitor.location_name
      } else {
        console.log(`Monitor ${monitor.id} has no valid location data`)
        continue
      }
      
      // Calculate distance
      const distance = haversineDistance(
        position.latitude,
        position.longitude,
        gLat,
        gLon
      )
      
      const isInside = distance <= gRadius
      const wasInside = monitor.vehicle_inside
      
      // Detect state change
      const hasEntered = !wasInside && isInside
      const hasExited = wasInside && !isInside
      
      // Check cooldown
      const lastTriggered = monitor.last_triggered_at ? new Date(monitor.last_triggered_at).getTime() : 0
      const inCooldown = Date.now() - lastTriggered < COOLDOWN_MS
      
      // Determine if we should trigger
      let shouldTrigger = false
      let eventType: 'enter' | 'exit' | null = null
      
      if (hasEntered && (monitor.trigger_on === 'enter' || monitor.trigger_on === 'both')) {
        shouldTrigger = true
        eventType = 'enter'
      } else if (hasExited && (monitor.trigger_on === 'exit' || monitor.trigger_on === 'both')) {
        shouldTrigger = true
        eventType = 'exit'
      }
      
      // Apply cooldown
      if (shouldTrigger && inCooldown) {
        console.log(`Monitor ${monitor.id} in cooldown, skipping trigger`)
        shouldTrigger = false
      }
      
      const vehicleName = vehicleNames.get(monitor.device_id) || monitor.device_id
      
      if (shouldTrigger && eventType) {
        console.log(`🚨 GEOFENCE ${eventType.toUpperCase()}: ${vehicleName} ${eventType === 'enter' ? 'arrived at' : 'left'} ${locationName}`)
        
        // Create geofence event
        events.push({
          monitor_id: monitor.id,
          device_id: monitor.device_id,
          event_type: eventType,
          location_name: locationName,
          latitude: position.latitude,
          longitude: position.longitude,
          metadata: {
            distance_meters: Math.round(distance),
            radius_meters: gRadius,
            vehicle_name: vehicleName,
            speed: position.speed
          }
        })
        
        // Also create proactive_vehicle_event for notifications
        const { error: eventError } = await supabase
          .from('proactive_vehicle_events')
          .insert({
            device_id: monitor.device_id,
            event_type: `geofence_${eventType}`,
            severity: 'info',
            title: eventType === 'enter' 
              ? `Arrived at ${locationName}`
              : `Left ${locationName}`,
            message: eventType === 'enter'
              ? `${vehicleName} has arrived at ${locationName}`
              : `${vehicleName} has left ${locationName}`,
            metadata: {
              monitor_id: monitor.id,
              location_name: locationName,
              latitude: position.latitude,
              longitude: position.longitude,
              distance_meters: Math.round(distance),
              geofence_lat: gLat,
              geofence_lon: gLon,
              geofence_radius: gRadius
            }
          })
        
        if (eventError) {
          console.error('Failed to create proactive event:', eventError)
        }
        
        // Prepare monitor update
        updates.push({
          id: monitor.id,
          vehicle_inside: isInside,
          last_checked_at: new Date().toISOString(),
          last_triggered_at: new Date().toISOString(),
          trigger_count: (monitor.trigger_count || 0) + 1,
          // Deactivate if one_time
          is_active: monitor.one_time ? false : true
        })
      } else {
        // Just update the checked time and inside state
        updates.push({
          id: monitor.id,
          vehicle_inside: isInside,
          last_checked_at: new Date().toISOString()
        })
      }
    }
    
    // 5. Batch insert geofence events
    if (events.length > 0) {
      const { error: insertError } = await supabase
        .from('geofence_events')
        .insert(events)
      
      if (insertError) {
        console.error('Failed to insert geofence events:', insertError)
      }
    }
    
    // 6. Batch update monitors
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('geofence_monitors')
        .update({
          vehicle_inside: update.vehicle_inside,
          last_checked_at: update.last_checked_at,
          ...(update.last_triggered_at && { 
            last_triggered_at: update.last_triggered_at,
            trigger_count: update.trigger_count 
          }),
          ...(update.is_active !== undefined && { is_active: update.is_active })
        })
        .eq('id', update.id)
      
      if (updateError) {
        console.error(`Failed to update monitor ${update.id}:`, updateError)
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`=== Geofence Check Complete: ${events.length} events triggered in ${duration}ms ===`)
    
    return new Response(JSON.stringify({
      success: true,
      monitors_checked: monitors.length,
      events_triggered: events.length,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('Geofence check error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})