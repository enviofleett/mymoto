import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callLLM } from '../_shared/llm-client.ts';

// OpenRouter LLM Client - all calls routed through shared client
const callGeminiAPI = callLLM;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log('Fetching fleet stats via RPC...')

    // Use the database RPC function for aggregated stats - much faster than fetching all rows
    const { data: stats, error: rpcError } = await supabase.rpc('get_fleet_stats')
    
    if (rpcError) {
      console.error('RPC error:', rpcError)
      throw new Error('Failed to fetch fleet stats')
    }

    console.log('Fleet stats from RPC:', stats)

    // Get recent position history count for trend context
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: historyCount } = await supabase
      .from('position_history')
      .select('id', { count: 'exact', head: true })
      .gte('gps_time', oneHourAgo)

    // Build low battery details string
    const lowBatteryDetails = stats.low_battery_details?.length > 0
      ? ` - ${stats.low_battery_details.map((v: any) => `${v.name}: ${v.battery}%`).join(', ')}`
      : ''

    // Build overspeeding details string
    const overspeedDetails = stats.overspeeding_details?.length > 0
      ? ` - ${stats.overspeeding_details.map((v: any) => `${v.name}: ${v.speed}km/h`).join(', ')}`
      : ''

    // Build system prompt with fleet data from RPC
    const systemPrompt = `You are a fleet health analyst AI. Generate a brief, actionable insight about the fleet's current status.
Be concise (2-3 sentences max), professional, and highlight the most important issue or positive trend.

CURRENT FLEET STATUS:
- Total Vehicles: ${stats.total}
- Online: ${stats.online} (${stats.offline} offline)
- Currently Moving: ${stats.moving}
- Average Speed (moving): ${stats.avg_speed} km/h
- Average Battery: ${stats.avg_battery}%
- Low Battery Vehicles (< 20%): ${stats.low_battery}${lowBatteryDetails}
- Overspeeding Alerts: ${stats.overspeeding}${overspeedDetails}
- Unassigned Vehicles: ${stats.unassigned}
- Position updates in last hour: ${historyCount || 0}

PRIORITY RULES:
1. If there are overspeeding vehicles, mention it as a safety concern first
2. If there are low battery vehicles, warn about potential tracking loss
3. If many vehicles are offline, highlight connectivity issues
4. If many vehicles are unassigned, mention operational efficiency
5. If everything looks good, give a positive summary

Generate a single insight paragraph. Start with an emoji that reflects the overall fleet health (✅ good, ⚠️ warning, 🚨 critical).`

    console.log('Calling Gemini API for fleet insights...')

    // Use shared Gemini client
    const result = await callGeminiAPI(
      systemPrompt,
      'Generate a fleet health insight based on the current data.',
      {
        maxOutputTokens: 200,
        temperature: 0.7,
        model: 'google/gemini-2.5-flash',
      }
    )
    
    const insight = result.text || 'Unable to generate insight.'

    console.log('Fleet insight generated successfully')

    // Save insight to history
    const { error: insertError } = await supabase
      .from('fleet_insights_history')
      .insert({
        content: insight,
        vehicles_analyzed: stats.total,
        alerts_count: stats.low_battery + stats.overspeeding,
        overspeeding_count: stats.overspeeding,
        low_battery_count: stats.low_battery,
        offline_count: stats.offline
      })

    if (insertError) {
      console.error('Failed to save insight to history:', insertError)
    }

    return new Response(JSON.stringify({ 
      insight,
      stats: {
        total: stats.total,
        online: stats.online,
        moving: stats.moving,
        lowBattery: stats.low_battery,
        overspeeding: stats.overspeeding,
        unassigned: stats.unassigned
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Fleet insights error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
