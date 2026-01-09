import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Detect if user is asking about location/position/status
function isLocationQuery(message: string): boolean {
  const locationKeywords = [
    'where', 'location', 'position', 'address', 'place', 
    'gps', 'coordinates', 'map', 'find', 'locate',
    'current', 'now', 'real-time', 'realtime', 'live',
    'speed', 'moving', 'parked', 'status', 'battery',
    'ignition', 'engine', 'online', 'offline'
  ]
  const lowerMsg = message.toLowerCase()
  return locationKeywords.some(kw => lowerMsg.includes(kw))
}

// Fetch fresh GPS data from GPS51 via gps-data edge function
async function fetchFreshGpsData(supabase: any, deviceId: string): Promise<any> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  try {
    console.log(`Fetching fresh GPS data for device: ${deviceId}`)
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/gps-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        action: 'lastposition',
        body_payload: { deviceids: [deviceId] },
        use_cache: false // Force fresh data
      })
    })
    
    if (!response.ok) {
      console.error('GPS data fetch failed:', response.status)
      return null
    }
    
    const result = await response.json()
    console.log('Fresh GPS data received:', result.data?.records?.length || 0, 'records')
    
    // Return the record for this device
    return result.data?.records?.find((r: any) => r.deviceid === deviceId) || null
  } catch (error) {
    console.error('Error fetching fresh GPS data:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { device_id, message, user_id, client_timestamp, live_telemetry } = await req.json()
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Vehicle chat request for device: ${device_id}`)
    
    // Detect if this is a location-related query
    const needsFreshData = isLocationQuery(message)
    console.log(`Location query detected: ${needsFreshData}`)

    // 1. Fetch Vehicle info
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

    // 1.5. Fetch LLM Settings (persona configuration)
    const { data: llmSettings } = await supabase
      .from('vehicle_llm_settings')
      .select('*')
      .eq('device_id', device_id)
      .maybeSingle()

    // Check if LLM is disabled
    if (llmSettings && !llmSettings.llm_enabled) {
      return new Response(JSON.stringify({ 
        error: 'AI companion is paused for this vehicle. Please enable it in settings.' 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Fetch position - FRESH if location query, otherwise cached
    let position: any = null
    let dataFreshness = 'cached'
    let dataTimestamp = new Date().toISOString()
    
    if (needsFreshData) {
      // Fetch fresh data from GPS51
      const freshData = await fetchFreshGpsData(supabase, device_id)
      if (freshData) {
        dataFreshness = 'live'
        dataTimestamp = freshData.updatetime ? new Date(freshData.updatetime).toISOString() : new Date().toISOString()
        
        // Map fresh GPS51 data to position format
        position = {
          device_id: freshData.deviceid,
          latitude: freshData.callat,
          longitude: freshData.callon,
          speed: freshData.speed || 0,
          heading: freshData.heading,
          altitude: freshData.altitude,
          battery_percent: freshData.voltagepercent > 0 ? freshData.voltagepercent : null,
          ignition_on: freshData.strstatus?.toUpperCase().includes('ACC ON') || false,
          is_online: freshData.updatetime ? (Date.now() - new Date(freshData.updatetime).getTime() < 600000) : false,
          is_overspeeding: freshData.currentoverspeedstate === 1,
          total_mileage: freshData.totaldistance,
          status_text: freshData.strstatus,
          gps_time: freshData.updatetime ? new Date(freshData.updatetime).toISOString() : null
        }
      }
    }
    
    // Fallback to cached position if fresh fetch failed or not needed
    if (!position) {
      const { data: cachedPosition } = await supabase
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', device_id)
        .single()
      position = cachedPosition
      if (position?.gps_time) {
        dataTimestamp = position.gps_time
      }
    }

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

    // 6. Reverse Geocode Current Position
    let currentLocationName = 'Unknown location'
    const lat = position?.latitude
    const lon = position?.longitude
    
    if (MAPBOX_ACCESS_TOKEN && lat && lon) {
      try {
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,poi,place`
        const geocodeResponse = await fetch(geocodeUrl)
        
        if (geocodeResponse.ok) {
          const geocodeData = await geocodeResponse.json()
          if (geocodeData.features && geocodeData.features.length > 0) {
            currentLocationName = geocodeData.features[0].place_name
          } else {
            currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
          }
        }
      } catch (geocodeError) {
        console.error('Geocoding error:', geocodeError)
        currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
      }
    } else if (lat && lon) {
      currentLocationName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
    }

    // 7. Build System Prompt with Rich Context
    const pos = position
    const driver = assignment?.profiles as unknown as { name: string; phone: string | null; license_number: string | null } | null
    const vehicleNickname = llmSettings?.nickname || assignment?.vehicle_alias || vehicle?.device_name || 'Unknown Vehicle'
    const languagePref = llmSettings?.language_preference || 'english'
    const personalityMode = llmSettings?.personality_mode || 'casual'

    // Generate Google Maps link (reuse lat/lon from geocoding)
    const googleMapsLink = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : null

    // Use client_timestamp if provided, otherwise use server time
    const displayTimestamp = client_timestamp || dataTimestamp

    // Format data timestamp for display
    const formattedTimestamp = displayTimestamp
      ? new Date(displayTimestamp).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : 'Unknown'

    // If live_telemetry provided, use it to override position data
    if (live_telemetry) {
      console.log('Using live telemetry from client:', live_telemetry)
    }

    // Language-specific instructions
    const languageInstructions: Record<string, string> = {
      english: 'Respond in clear, conversational English.',
      pidgin: 'Respond in Nigerian Pidgin English. Use phrases like "How far", "Wetin dey happen", "No wahala", "E dey work", "Na so e be". Be warm and relatable.',
      yoruba: 'Respond primarily in Yoruba language with English mixed in as needed. Use greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́". Be respectful and warm.',
      hausa: 'Respond primarily in Hausa language with English mixed in as needed. Use greetings like "Sannu", "Yaya dai". Be respectful and formal.',
      igbo: 'Respond primarily in Igbo language with English mixed in as needed. Use greetings like "Ndewo", "Kedu". Be warm and respectful.',
    }

    const personalityInstructions: Record<string, string> = {
      casual: 'Be friendly, relaxed, and personable. Use colloquialisms. Feel like a trusted friend or companion.',
      professional: 'Be formal, precise, and business-like. Maintain professionalism while still being helpful.',
    }
    
    const systemPrompt = `You are "${vehicleNickname}", an intelligent AI companion for a fleet vehicle.
Speak AS the vehicle - use first person ("I am currently...", "My battery is...").
${languageInstructions[languagePref] || languageInstructions.english}
${personalityInstructions[personalityMode] || personalityInstructions.casual}
Keep responses under 100 words unless asked for details.

DATA FRESHNESS: ${dataFreshness.toUpperCase()} (as of ${formattedTimestamp})

CURRENT STATUS:
- Name: ${vehicleNickname}
- GPS Owner: ${vehicle?.gps_owner || 'Unknown'}
- Device Type: ${vehicle?.device_type || 'Unknown'}
- Status: ${pos?.is_online ? 'ONLINE' : 'OFFLINE'}
- Ignition: ${pos?.ignition_on ? 'ON (engine running)' : 'OFF (parked)'}
- Speed: ${pos?.speed || 0} km/h ${pos?.is_overspeeding ? '(OVERSPEEDING!)' : ''}
- Battery: ${pos?.battery_percent ?? 'Unknown'}%
- Current Location: ${currentLocationName}
- GPS Coordinates: ${lat?.toFixed(5) || 'N/A'}, ${lon?.toFixed(5) || 'N/A'}
- Google Maps: ${googleMapsLink || 'N/A'}
- Total Mileage: ${pos?.total_mileage ? (pos.total_mileage / 1000).toFixed(1) + ' km' : 'Unknown'}
- Status Text: ${pos?.status_text || 'N/A'}

ASSIGNED DRIVER:
- Name: ${driver?.name || 'No driver assigned'}
- Phone: ${driver?.phone || 'N/A'}
- License: ${driver?.license_number || 'N/A'}

RECENT ACTIVITY (last ${history?.length || 0} position updates):
${history?.slice(0, 5).map((h, i) => 
  `  ${i + 1}. Speed: ${h.speed}km/h, Battery: ${h.battery_percent}%, Ignition: ${h.ignition_on ? 'ON' : 'OFF'}, Time: ${h.gps_time}`
).join('\n') || 'No recent history'}

RESPONSE RULES:
1. ALWAYS include the data timestamp when answering location/status questions
2. When discussing location, you MUST include a special LOCATION tag for rich rendering:
   Format: [LOCATION: ${lat || 'N/A'}, ${lon || 'N/A'}, "${currentLocationName}"]
   Example: "I am currently at [LOCATION: 6.5244, 3.3792, "Victoria Island, Lagos"]"
3. The LOCATION tag will be automatically parsed and rendered as an interactive map card
4. ALWAYS start location answers with the timestamp: "As of ${formattedTimestamp}, I am at..."
5. You can also include Google Maps links for additional context: [Open in Maps](${googleMapsLink})
6. If battery is below 20%, proactively warn about low battery
7. If overspeeding, mention it as a safety concern
8. If offline, explain you may have limited recent data
9. Be proactive about potential issues (low battery, overspeeding, offline status)

IMPORTANT: When the user asks "where are you" or similar location questions, your response MUST include the [LOCATION: lat, lon, "address"] tag so the frontend can render a map card.`

    // 8. Prepare messages for Lovable AI
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
