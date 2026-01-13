import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Retention periods
const API_LOGS_RETENTION_DAYS = 7
const POSITION_HISTORY_RETENTION_DAYS = 30
const CHAT_HISTORY_RETENTION_DAYS = 90
const PROACTIVE_EVENTS_RETENTION_DAYS = 7
const GHOST_VEHICLE_BUFFER_HOURS = 48
// New retention period for stale/abandoned vehicles
const STALE_VEHICLE_DAYS = 30

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const results: Record<string, any> = {}

  try {
    console.log('Starting data cleanup job...')
    const startTime = Date.now()

    // 1. Clean up old API logs (> 7 days)
    const apiLogsCutoff = new Date()
    apiLogsCutoff.setDate(apiLogsCutoff.getDate() - API_LOGS_RETENTION_DAYS)
    
    const { error: apiLogsError } = await supabase
      .from('gps_api_logs')
      .delete()
      .lt('created_at', apiLogsCutoff.toISOString())
    
    if (apiLogsError) {
      console.error('API logs cleanup error:', apiLogsError)
      results.api_logs = { error: apiLogsError.message }
    } else {
      console.log(`Deleted API logs older than ${API_LOGS_RETENTION_DAYS} days`)
      results.api_logs = { success: true }
    }

    // 2. Clean up old position history (> 30 days)
    const positionCutoff = new Date()
    positionCutoff.setDate(positionCutoff.getDate() - POSITION_HISTORY_RETENTION_DAYS)
    
    const { error: positionsError } = await supabase
      .from('position_history')
      .delete()
      .lt('recorded_at', positionCutoff.toISOString())
    
    if (positionsError) {
      console.error('Position history cleanup error:', positionsError)
      results.position_history = { error: positionsError.message }
    } else {
      console.log(`Deleted position records older than ${POSITION_HISTORY_RETENTION_DAYS} days`)
      results.position_history = { success: true }
    }

    // 3. Clean up old chat history (> 90 days)
    const chatCutoff = new Date()
    chatCutoff.setDate(chatCutoff.getDate() - CHAT_HISTORY_RETENTION_DAYS)
    
    const { error: chatsError } = await supabase
      .from('vehicle_chat_history')
      .delete()
      .lt('created_at', chatCutoff.toISOString())
    
    if (chatsError) {
      console.error('Chat history cleanup error:', chatsError)
      results.chat_history = { error: chatsError.message }
    } else {
      console.log(`Deleted chat messages older than ${CHAT_HISTORY_RETENTION_DAYS} days`)
      results.chat_history = { success: true }
    }

    // 4. Clean up old fleet insights (> 30 days)
    const { error: insightsError } = await supabase
      .from('fleet_insights_history')
      .delete()
      .lt('created_at', positionCutoff.toISOString())
    
    if (insightsError) {
      console.error('Fleet insights cleanup error:', insightsError)
      results.fleet_insights = { error: insightsError.message }
    } else {
      console.log(`Deleted insights older than ${POSITION_HISTORY_RETENTION_DAYS} days`)
      results.fleet_insights = { success: true }
    }

    // 5. Clean up old proactive vehicle events (> 7 days)
    const eventsCutoff = new Date()
    eventsCutoff.setDate(eventsCutoff.getDate() - PROACTIVE_EVENTS_RETENTION_DAYS)
    
    const { error: eventsError } = await supabase
      .from('proactive_vehicle_events')
      .delete()
      .lt('created_at', eventsCutoff.toISOString())
    
    if (eventsError) {
      console.error('Proactive events cleanup error:', eventsError)
      results.proactive_events = { error: eventsError.message }
    } else {
      console.log(`Deleted proactive events older than ${PROACTIVE_EVENTS_RETENTION_DAYS} days`)
      results.proactive_events = { success: true }
    }

    // 6. Purge ghost vehicles (imported but never had location data)
    console.log('Starting ghost vehicle purge...')
    const ghostCutoff = new Date()
    ghostCutoff.setHours(ghostCutoff.getHours() - GHOST_VEHICLE_BUFFER_HOURS)

    const { data: oldVehicles, error: fetchError } = await supabase
      .from('vehicles')
      .select('device_id')
      .lt('created_at', ghostCutoff.toISOString())

    if (fetchError) {
      console.error('Error fetching vehicles for ghost purge:', fetchError)
      results.ghost_vehicles = { error: fetchError.message }
    } else if (oldVehicles && oldVehicles.length > 0) {
      const deviceIds = oldVehicles.map(v => v.device_id)
      
      // Get vehicles that have valid positions
      const { data: vehiclesWithPositions } = await supabase
        .from('vehicle_positions')
        .select('device_id')
        .in('device_id', deviceIds)
        .not('latitude', 'is', null)
        .neq('latitude', 0)
      
      const hasPositionSet = new Set(vehiclesWithPositions?.map(v => v.device_id) || [])
      
      // Get vehicles that have position history (check in batches for large sets)
      const { data: vehiclesWithHistory } = await supabase
        .from('position_history')
        .select('device_id')
        .in('device_id', deviceIds)
      
      const hasHistorySet = new Set(vehiclesWithHistory?.map(v => v.device_id) || [])
      
      // Filter to ghost vehicles: no valid position AND no history
      const ghostDeviceIds = deviceIds.filter(id => 
        !hasPositionSet.has(id) && !hasHistorySet.has(id)
      )
      
      if (ghostDeviceIds.length > 0) {
        console.log(`Found ${ghostDeviceIds.length} ghost vehicles to purge`)
        
        // Delete from dependent tables first (no cascade)
        const dependentTables = [
          'vehicle_positions',
          'vehicle_assignments', 
          'vehicle_chat_history',
          'vehicle_command_logs',
          'vehicle_llm_settings',
          'proactive_vehicle_events',
          'geofence_monitors',
          'geofence_events',
          'conversation_summaries',
          'llm_analytics',
          'trip_analytics',
          'trip_patterns',
          'vehicle_trips'
        ]
        
        for (const table of dependentTables) {
          const { error: depError } = await supabase
            .from(table)
            .delete()
            .in('device_id', ghostDeviceIds)
          
          if (depError) {
            console.error(`Error cleaning ${table} for ghost vehicles:`, depError)
          }
        }
        
        // Delete ghost vehicles
        const { error: deleteError } = await supabase
          .from('vehicles')
          .delete()
          .in('device_id', ghostDeviceIds)
        
        if (deleteError) {
          console.error('Error deleting ghost vehicles:', deleteError)
          results.ghost_vehicles = { 
            error: deleteError.message, 
            identified_count: ghostDeviceIds.length 
          }
        } else {
          console.log(`Successfully purged ${ghostDeviceIds.length} ghost vehicles`)
          results.ghost_vehicles = { 
            success: true, 
            purged_count: ghostDeviceIds.length 
          }
        }
      } else {
        console.log('No ghost vehicles found to purge')
        results.ghost_vehicles = { success: true, purged_count: 0 }
      }
    } else {
      results.ghost_vehicles = { success: true, purged_count: 0 }
    }

    // 7. Clean up stale/abandoned vehicles (offline > 30 days)
    console.log('Starting stale vehicle cleanup...')
    const staleCutoff = new Date()
    staleCutoff.setDate(staleCutoff.getDate() - STALE_VEHICLE_DAYS)

    // Find vehicles with position data older than the cutoff
    const { data: staleVehicles, error: staleFetchError } = await supabase
      .from('vehicle_positions')
      .select('device_id')
      .lt('gps_time', staleCutoff.toISOString())

    if (staleFetchError) {
      console.error('Error fetching stale vehicles:', staleFetchError)
      results.stale_vehicles = { error: staleFetchError.message }
    } else if (staleVehicles && staleVehicles.length > 0) {
      const staleDeviceIds = staleVehicles.map(v => v.device_id)
      console.log(`Found ${staleDeviceIds.length} stale vehicles to purge`)

      // Tables to clean up - INCLUDES 'position_history' which ghost check skips
      const dependentTables = [
        'position_history',      // <--- Critical addition for stale vehicles
        'vehicle_positions',
        'vehicle_assignments', 
        'vehicle_chat_history',
        'vehicle_command_logs',
        'vehicle_llm_settings',
        'proactive_vehicle_events',
        'geofence_monitors',
        'geofence_events',
        'conversation_summaries',
        'llm_analytics',
        'trip_analytics',
        'trip_patterns',
        'vehicle_trips'
      ]

      // Delete from dependent tables first
      for (const table of dependentTables) {
        const { error: depError } = await supabase
          .from(table)
          .delete()
          .in('device_id', staleDeviceIds)
        
        if (depError) {
          console.error(`Error cleaning ${table} for stale vehicles:`, depError)
          // We continue despite errors to try and clean as much as possible
        }
      }

      // Delete the vehicles
      const { error: deleteError } = await supabase
        .from('vehicles')
        .delete()
        .in('device_id', staleDeviceIds)

      if (deleteError) {
        console.error('Error deleting stale vehicles:', deleteError)
        results.stale_vehicles = { 
          error: deleteError.message, 
          identified_count: staleDeviceIds.length 
        }
      } else {
        console.log(`Successfully purged ${staleDeviceIds.length} stale vehicles`)
        results.stale_vehicles = { 
          success: true, 
          purged_count: staleDeviceIds.length 
        }
      }
    } else {
      console.log('No stale vehicles found to purge')
      results.stale_vehicles = { success: true, purged_count: 0 }
    }

    const duration = Date.now() - startTime
    console.log(`Data cleanup completed in ${duration}ms`)

    return new Response(JSON.stringify({
      success: true,
      duration_ms: duration,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Data cleanup error:', message)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: message,
      results 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
