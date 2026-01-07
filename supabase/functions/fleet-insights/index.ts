import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Fetching fleet data for insights...')

    // 1. Fetch all vehicles with current positions
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select(`
        device_id, device_name, gps_owner
      `)

    // 2. Fetch all current positions
    const { data: positions } = await supabase
      .from('vehicle_positions')
      .select('*')

    // 3. Fetch driver assignments
    const { data: assignments } = await supabase
      .from('vehicle_assignments')
      .select('device_id, profile_id, vehicle_alias')

    // 4. Get recent position history for trend analysis (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentHistory } = await supabase
      .from('position_history')
      .select('device_id, speed, battery_percent, ignition_on, gps_time')
      .gte('gps_time', oneHourAgo)
      .order('gps_time', { ascending: false })

    // 5. Aggregate fleet statistics
    const totalVehicles = vehicles?.length || 0
    const onlineVehicles = positions?.filter(p => p.is_online)?.length || 0
    const offlineVehicles = totalVehicles - onlineVehicles
    const movingVehicles = positions?.filter(p => p.speed && p.speed > 0)?.length || 0
    const lowBatteryVehicles = positions?.filter(p => p.battery_percent !== null && p.battery_percent < 20) || []
    const overspeedingVehicles = positions?.filter(p => p.is_overspeeding) || []
    const unassignedVehicles = totalVehicles - (assignments?.filter(a => a.profile_id)?.length || 0)

    // Calculate average speed for moving vehicles
    const movingSpeeds = positions?.filter(p => p.speed && p.speed > 0).map(p => p.speed) || []
    const avgSpeed = movingSpeeds.length > 0 
      ? (movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length).toFixed(1) 
      : 0

    // Calculate average battery
    const batteries = positions?.filter(p => p.battery_percent !== null).map(p => p.battery_percent!) || []
    const avgBattery = batteries.length > 0 
      ? Math.round(batteries.reduce((a, b) => a + b, 0) / batteries.length) 
      : null

    // Get vehicles with low battery details
    const lowBatteryDetails = lowBatteryVehicles.map(p => {
      const vehicle = vehicles?.find(v => v.device_id === p.device_id)
      const assignment = assignments?.find(a => a.device_id === p.device_id)
      return {
        name: assignment?.vehicle_alias || vehicle?.device_name || p.device_id,
        battery: p.battery_percent
      }
    })

    // Get overspeeding details
    const overspeedDetails = overspeedingVehicles.map(p => {
      const vehicle = vehicles?.find(v => v.device_id === p.device_id)
      const assignment = assignments?.find(a => a.device_id === p.device_id)
      return {
        name: assignment?.vehicle_alias || vehicle?.device_name || p.device_id,
        speed: p.speed
      }
    })

    // Build system prompt with fleet data
    const systemPrompt = `You are a fleet health analyst AI. Generate a brief, actionable insight about the fleet's current status.
Be concise (2-3 sentences max), professional, and highlight the most important issue or positive trend.

CURRENT FLEET STATUS:
- Total Vehicles: ${totalVehicles}
- Online: ${onlineVehicles} (${offlineVehicles} offline)
- Currently Moving: ${movingVehicles}
- Average Speed (moving): ${avgSpeed} km/h
- Average Battery: ${avgBattery !== null ? avgBattery + '%' : 'N/A'}
- Low Battery Vehicles (< 20%): ${lowBatteryVehicles.length}${lowBatteryDetails.length > 0 ? ` - ${lowBatteryDetails.map(v => `${v.name}: ${v.battery}%`).join(', ')}` : ''}
- Overspeeding Alerts: ${overspeedingVehicles.length}${overspeedDetails.length > 0 ? ` - ${overspeedDetails.map(v => `${v.name}: ${v.speed}km/h`).join(', ')}` : ''}
- Unassigned Vehicles: ${unassignedVehicles}
- Position updates in last hour: ${recentHistory?.length || 0}

PRIORITY RULES:
1. If there are overspeeding vehicles, mention it as a safety concern first
2. If there are low battery vehicles, warn about potential tracking loss
3. If many vehicles are offline, highlight connectivity issues
4. If many vehicles are unassigned, mention operational efficiency
5. If everything looks good, give a positive summary

Generate a single insight paragraph. Start with an emoji that reflects the overall fleet health (✅ good, ⚠️ warning, 🚨 critical).`

    console.log('Calling Lovable AI for fleet insights...')

    // Call Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate a fleet health insight based on the current data.' }
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI gateway error:', response.status, errorText)
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`AI gateway error: ${response.status}`)
    }

    const aiData = await response.json()
    const insight = aiData.choices?.[0]?.message?.content || 'Unable to generate insight.'

    console.log('Fleet insight generated successfully')

    return new Response(JSON.stringify({ 
      insight,
      stats: {
        total: totalVehicles,
        online: onlineVehicles,
        moving: movingVehicles,
        lowBattery: lowBatteryVehicles.length,
        overspeeding: overspeedingVehicles.length,
        unassigned: unassignedVehicles
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
