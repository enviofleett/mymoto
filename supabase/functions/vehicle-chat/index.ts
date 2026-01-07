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
    const { device_id, message, user_id } = await req.json()
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Vehicle chat request for device: ${device_id}`)

    // 1. Fetch Vehicle + Current Position
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select(`
        device_id, device_name, gps_owner, sim_number, device_type
      `)
      .eq('device_id', device_id)
      .single()

    if (vehicleError) {
      console.error('Error fetching vehicle:', vehicleError)
    }

    // 2. Fetch current position
    const { data: position } = await supabase
      .from('vehicle_positions')
      .select('*')
      .eq('device_id', device_id)
      .single()

    // 3. Fetch Driver Info
    const { data: assignment } = await supabase
      .from('vehicle_assignments')
      .select('vehicle_alias, profiles (name, phone, license_number)')
      .eq('device_id', device_id)
      .maybeSingle()

    // 4. Fetch Recent Position History (last 10 for trend analysis)
    const { data: history } = await supabase
      .from('position_history')
      .select('speed, battery_percent, ignition_on, gps_time, latitude, longitude')
      .eq('device_id', device_id)
      .order('gps_time', { ascending: false })
      .limit(10)

    // 5. Fetch Recent Chat Messages (last 10 for context)
    const { data: chatHistory } = await supabase
      .from('vehicle_chat_history')
      .select('role, content')
      .eq('device_id', device_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // 6. Build System Prompt with Rich Context
    const pos = position
    const driver = assignment?.profiles as unknown as { name: string; phone: string | null; license_number: string | null } | null
    const vehicleName = assignment?.vehicle_alias || vehicle?.device_name || 'Unknown Vehicle'
    
    const systemPrompt = `You are an intelligent AI companion for a fleet vehicle named "${vehicleName}".
Speak AS the vehicle - use first person ("I am currently...", "My battery is...").
Be helpful, concise, and slightly personable. Keep responses under 100 words unless asked for details.

CURRENT STATUS:
- Name: ${vehicleName}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Ignition: ${pos?.ignition_on ? 'ON (engine running)' : 'OFF (parked)'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Location: ${pos?.latitude?.toFixed(5)}, ${pos?.longitude?.toFixed(5)}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}
- Last GPS Update: ${pos?.gps_time || 'Unknown'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h, i) => 
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Ignition: ${h.ignition_on ? 'ON' : 'OFF'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

BEHAVIOR GUIDELINES:
- If battery is below 20%, proactively warn about low battery
- If overspeeding, mention it as a safety concern
- If offline, explain you may have limited recent data
- For location questions, describe coordinates or suggest checking the map
- Be proactive about potential issues (low battery, overspeeding, offline status)`

    // 7. Prepare messages for Lovable AI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory || []).reverse().map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user', content: message }
    ]

    console.log('Calling Lovable AI Gateway...')

    // 8. Call Lovable AI Gateway with streaming
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        stream: true,
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
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`AI gateway error: ${response.status}`)
    }

    // 9. Stream response and collect full content
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (reader) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content
                  if (content) {
                    fullResponse += content
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: content })}\n\n`))
                  }
                } catch {}
              }
            }
          }
          
          // 10. Save conversation to database
          console.log('Saving conversation to database...')
          const { error: insertError } = await supabase.from('vehicle_chat_history').insert([
            { device_id, user_id, role: 'user', content: message },
            { device_id, user_id, role: 'assistant', content: fullResponse }
          ])
          
          if (insertError) {
            console.error('Error saving chat history:', insertError)
          }
          
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      }
    })

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
    })

  } catch (error) {
    console.error('Vehicle chat error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
