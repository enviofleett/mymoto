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
