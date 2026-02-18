import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OFFLINE_THRESHOLD_HOURS = 1
const COOLDOWN_MINUTES = 60 // Don't create duplicate offline alerts within 1 hour

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[OfflineCheck] Starting offline vehicle detection...')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find vehicles that haven't updated in over 1 hour
    const offlineThreshold = new Date(Date.now() - OFFLINE_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()
    
    const { data: offlineVehicles, error: fetchError } = await supabase
      .from('vehicle_positions')
      .select(`
        device_id,
        gps_time,
        is_online,
        battery_percent,
        cached_at
      `)
      .or(`gps_time.lt.${offlineThreshold},gps_time.is.null`)
      .order('gps_time', { ascending: true, nullsFirst: true })

    if (fetchError) {
      console.error('[OfflineCheck] Error fetching vehicles:', fetchError)
      throw fetchError
    }

    console.log(`[OfflineCheck] Found ${offlineVehicles?.length || 0} potentially offline vehicles`)

    if (!offlineVehicles || offlineVehicles.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No offline vehicles detected',
        checked: 0,
        alerts_created: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const activeDeviceIds: string[] = []

    if (offlineVehicles && offlineVehicles.length > 0) {
      const ids = offlineVehicles.map(v => v.device_id)
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('device_id, vehicle_status')
        .in('device_id', ids)

      if (vehicles) {
        for (const v of vehicles) {
          if (v.vehicle_status !== 'hibernated') {
            activeDeviceIds.push(v.device_id)
          }
        }
      }
    }

    const filteredOffline = offlineVehicles.filter(v => activeDeviceIds.includes(v.device_id))

    if (filteredOffline.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No eligible offline vehicles (all hibernated or none found)',
        checked: offlineVehicles.length,
        alerts_created: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get recent offline alerts to avoid duplicates
    const cooldownThreshold = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
    
    const { data: recentAlerts } = await supabase
      .from('proactive_vehicle_events')
      .select('device_id')
      .eq('event_type', 'offline')
      .gt('created_at', cooldownThreshold)

    const recentAlertDevices = new Set(recentAlerts?.map(a => a.device_id) || [])
    console.log(`[OfflineCheck] ${recentAlertDevices.size} devices have recent offline alerts (cooldown)`)

    // Filter out vehicles that already have recent alerts
    const vehiclesToAlert = filteredOffline.filter(v => !recentAlertDevices.has(v.device_id))
    console.log(`[OfflineCheck] ${vehiclesToAlert.length} vehicles need new offline alerts`)

    if (vehiclesToAlert.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All offline vehicles already have recent alerts',
        checked: offlineVehicles.length,
        alerts_created: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get vehicle names for better alert messages
    const deviceIds = vehiclesToAlert.map(v => v.device_id)
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('device_id, device_name')
      .in('device_id', deviceIds)

    const vehicleNames = new Map(vehicles?.map(v => [v.device_id, v.device_name]) || [])

    const { data: assignments } = await supabase
      .from('vehicle_assignments')
      .select('device_id, vehicle_alias')
      .in('device_id', deviceIds)

    const vehicleAliases = new Map(assignments?.map(a => [a.device_id, a.vehicle_alias]) || [])

    // Create offline alerts
    const now = new Date()
    const alertsToInsert = vehiclesToAlert.map(vehicle => {
      const lastSeen = vehicle.gps_time ? new Date(vehicle.gps_time) : null
      const hoursOffline = lastSeen 
        ? Math.round((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60)) 
        : null

      const vehicleName = vehicleAliases.get(vehicle.device_id) 
        || vehicleNames.get(vehicle.device_id) 
        || vehicle.device_id

      const severity = hoursOffline && hoursOffline > 24 ? 'error' : 'warning'

      return {
        device_id: vehicle.device_id,
        event_type: 'offline',
        severity,
        title: 'Vehicle Offline',
        message: hoursOffline 
          ? `${vehicleName} has been offline for ${hoursOffline} hour${hoursOffline !== 1 ? 's' : ''}`
          : `${vehicleName} has no GPS data`,
        metadata: {
          last_seen: vehicle.gps_time,
          hours_offline: hoursOffline,
          vehicle_name: vehicleName,
          battery_at_disconnect: vehicle.battery_percent,
          detected_by: 'cron'
        }
      }
    })

    const { data: insertedAlerts, error: insertError } = await supabase
      .from('proactive_vehicle_events')
      .insert(alertsToInsert)
      .select('id')

    if (insertError) {
      console.error('[OfflineCheck] Error inserting alerts:', insertError)
      throw insertError
    }

    console.log(`[OfflineCheck] Created ${insertedAlerts?.length || 0} offline alerts`)

    // Update vehicle_positions to mark as offline
    const { error: updateError } = await supabase
      .from('vehicle_positions')
      .update({ is_online: false })
      .in('device_id', deviceIds)

    if (updateError) {
      console.error('[OfflineCheck] Error updating online status:', updateError)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Created ${insertedAlerts?.length || 0} offline alerts`,
      checked: offlineVehicles.length,
      alerts_created: insertedAlerts?.length || 0,
      devices: deviceIds.slice(0, 10) // Return first 10 for logging
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[OfflineCheck] Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
