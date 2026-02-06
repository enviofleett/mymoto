import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildConversationContext, callLovableAPI, buildSystemPrompt } from './conversation-manager.ts'
import { learnAndGetPreferences, buildPreferenceContext, getUserPreferences } from './preference-learner.ts'
import { extractDateContext, isHistoricalMovementQuery } from './date-extractor.ts'
import { TOOLS, TOOLS_SCHEMA } from './tools.ts'

// Declare Deno for linter
declare const Deno: any;

// ============================================================================
// Main Handler - Agentic Version
// ============================================================================

async function handler(req: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const {
    message,
    vehicle_id: req_vehicle_id,
    device_id,
    conversation_id,
    client_timestamp,
    user_timezone,
    user_id: req_user_id, // Allow passing user_id for testing/service calls
  } = await req.json()

  // Standardize on device_id (matching frontend)
  let target_device_id = device_id || req_vehicle_id

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Device ID Resolution: If input is a name (e.g., "RBC784CX"), resolve to ID
  // Heuristic: If it contains non-digits or is short, assume it's a name
  if (target_device_id && !/^\d+$/.test(target_device_id)) {
    console.log(`[Handler] Resolving device name to device_id: ${target_device_id}`)
    
    // Try to find by device_name
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('device_id')
      .ilike('device_name', target_device_id)
      .limit(1)

    if (vehicles && vehicles.length > 0) {
      console.log(`[Handler] Resolved device_id: ${vehicles[0].device_id}`)
      target_device_id = vehicles[0].device_id
    } else {
      console.warn(`[Handler] Could not resolve device name: ${target_device_id}`)
      // We continue with the original ID, hoping it works or failing gracefully later
    }
  }

  // Get User ID from Auth Header
  const authHeader = req.headers.get('Authorization')
  let user_id: string | null = null
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (user) {
      user_id = user.id
    } else {
      console.warn('User authentication failed:', error)
    }
  }

  // Fallback: Use request body user_id (useful for testing or service-role calls)
  if (!user_id && req_user_id) {
    user_id = req_user_id
    console.log('[Auth] Using user_id from request body:', user_id)
  }

  if (!user_id) {
    // Fallback or Error? 
    // For now, if no user_id, we can't save history/prefs correctly tied to a user.
    // We might default to a nil UUID or fail.
    // Let's warn and try to proceed, but DB inserts might fail if user_id is NOT NULL.
    // The schema says user_id is NOT NULL.
    console.error('No authenticated user found. Chat history and preferences will fail.')
    // We'll throw an error to return 401/400 to the client
    return new Response(JSON.stringify({ error: 'Unauthorized: User ID required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    // 1. Gather Context in Parallel
    const [
      conversationContext,
      preferenceContextRaw,
      dateContext,
    ] = await Promise.all([
      buildConversationContext(supabase, target_device_id, user_id), // FIXED: Pass user_id
      getUserPreferences(supabase, user_id),
      extractDateContext(message, client_timestamp, user_timezone),
    ])

    const preferenceContext = buildPreferenceContext(preferenceContextRaw)

    // 2. Fetch Basic Vehicle Info for Persona
    const { data: vehicleInfo } = await supabase
      .from('vehicles')
      .select('device_name, device_type')
      .eq('device_id', target_device_id)
      .maybeSingle()
      
    // 3. Build System Prompt
    const systemPersona = buildSystemPrompt(
      { 
        name: vehicleInfo?.device_name || 'Vehicle', 
        plate: vehicleInfo?.device_name || target_device_id,
        model: vehicleInfo?.device_type || 'Vehicle'
      },
      {
        location: 'Unknown (Call get_vehicle_status)', 
        status: 'Unknown (Call get_vehicle_status)',
        speed: 0
      },
      preferenceContext
    )

    const dateSystemInfo = `
Current Date/Time: ${dateContext.humanReadable} (${dateContext.startDate})
User Timezone: ${user_timezone || 'UTC'}

CRITICAL INSTRUCTIONS:
1. You have NO internal knowledge of the vehicle's current state.
2. You MUST call 'get_vehicle_status' immediately if the user asks "Where are you?", "Status?", or "Speed?".
3. Do NOT make up a response. If you haven't called a tool, you don't know the answer.

LOCATION RESPONSE FORMAT:
When reporting location from tool results:
1. Use the 'address' field (human-readable address) - NEVER show raw coordinates to the user
2. ALWAYS include location data in this EXACT format: [LOCATION: lat, lng, "address"]
3. Example: "I'm currently parked and online! [LOCATION: 9.067, 7.431, "Wuse 2, Abuja, Nigeria"] 📍"
4. The frontend will automatically render this as an interactive map with a link to Google Maps

DATA SOURCE RULES:
1. Real-Time Data: 'get_vehicle_status' queries the live 'vehicle_positions' table.
2. Trip History: 'get_trip_history' queries the 'vehicle_trips' view - shows completed trips with start/end locations.
3. Position History: 'get_position_history' queries raw GPS points - use for "where was I at [time]?" or detailed movement tracking.
4. Alarms: 'create_geofence_alert' sets up monitoring.
5. IMPORTANT: You CAN access history ('get_trip_history' and 'get_position_history') even if 'get_vehicle_status' says "offline". Offline only means "no live GPS", not "database is down".

WHEN TO USE EACH TOOL:
- "Where are you now?" → get_vehicle_status (real-time location)
- "What trips did I make today?" → get_trip_history (aggregated trips)
- "How many trips this week?" → get_trip_analytics (comprehensive stats)
- "How long was I driving today?" → get_trip_analytics (drive time, parking time)
- "What are my stats for this month?" → get_trip_analytics (period analytics)
- "Where do I usually park?" → get_favorite_locations (frequent destinations)
- "What are my favorite spots?" → get_favorite_locations (top visited places)
- "Where was I at 3pm?" → get_position_history (detailed GPS tracking)
- "Where was I between 9am and 5pm?" → get_position_history (time range tracking)
- "Track my route from A to B" → get_position_history (detailed path)
`

    const finalSystemPrompt = `${systemPersona}\n${dateSystemInfo}`

    // 4. Construct Message History
    const messages: any[] = [
      { role: 'system', content: finalSystemPrompt },
      ...conversationContext.recent_messages,
      { role: 'user', content: message }
    ]

    // 5. Agent Loop
    let finalResponseText = "I'm having trouble connecting to my systems."
    let queryType = 'general'
    let metadata: any = {}
    const MAX_TURNS = 5
    let turnCount = 0

    // Pre-fetch trip history for historical queries to ensure data is available
    if (isHistoricalMovementQuery(message)) {
      const startDate = dateContext.hasDateReference
        ? dateContext.startDate
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const endDate = dateContext.hasDateReference
        ? dateContext.endDate
        : new Date().toISOString()

      const toolArgs = { start_date: startDate, end_date: endDate }
      const toolDef = TOOLS.find(t => t.name === 'get_trip_history')

      if (toolDef) {
        const toolCallId = crypto.randomUUID()
        const toolResult = await toolDef.execute(toolArgs, { supabase, device_id: target_device_id })
        metadata['get_trip_history'] = toolResult

        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: 'get_trip_history',
              arguments: JSON.stringify(toolArgs)
            }
          }]
        })
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult)
        })
      }
    }
    
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      turnCount = turn + 1
      console.log(`[Agent] Turn ${turn + 1}`)
      
      const llmResponse = await callLovableAPI(messages, undefined, {
        tools: TOOLS_SCHEMA,
        tool_choice: 'auto'
      })

      // If text content exists, append it (it might be the final answer or a thought)
      if (llmResponse.text) {
        messages.push({ role: 'assistant', content: llmResponse.text })
      }

      // Handle Tool Calls
      if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
        queryType = 'agent_action'
        
        // If the assistant didn't output text, we need to add a message with just tool_calls
        // (If it did output text, we already added it above. OpenAI allows both or one.)
        // Actually, for OpenAI format, if there are tool calls, the message usually has 'tool_calls' field.
        // Our 'messages' array needs to strictly follow the format.
        // If we pushed text above, we need to attach tool_calls to THAT message or replace it.
        
        // Correct handling:
        const assistantMsg: any = { role: 'assistant', content: llmResponse.text || null, tool_calls: llmResponse.tool_calls }
        
        // If we already pushed text, remove it and replace with the combined message
        if (llmResponse.text) {
          messages.pop()
        }
        messages.push(assistantMsg)

        // Execute Tools
        for (const toolCall of llmResponse.tool_calls) {
          const functionName = toolCall.function.name
          const functionArgs = JSON.parse(toolCall.function.arguments)
          
          console.log(`[Agent] Executing tool: ${functionName}`, functionArgs)
          
          const toolDef = TOOLS.find(t => t.name === functionName)
          let toolResult: any
          
          if (toolDef) {
            try {
              toolResult = await toolDef.execute(functionArgs, { supabase, device_id: target_device_id })
            } catch (err: any) {
              console.error(`[Agent] Tool error ${functionName}:`, err)
              toolResult = { error: err.message }
            }
          } else {
            toolResult = { error: `Tool ${functionName} not found` }
          }
          
          // Append Tool Result
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          })
          
          // Save metadata
          metadata[functionName] = toolResult
        }
        // Loop continues to get the next response from LLM
      } else {
        // No tool calls -> Final Answer
        finalResponseText = llmResponse.text || "I didn't receive a response."
        break
      }
    }

    // 6. Log Conversation (Fixed: Use vehicle_chat_history)
    // We log both the user message and the assistant response as separate entries
    
    // 6a. Log User Message
    const { error: userMsgError } = await supabase.from('vehicle_chat_history').insert({
      device_id: target_device_id,
      user_id: user_id,
      role: 'user',
      content: message,
      // created_at defaults to now()
    })

    if (userMsgError) console.error('Failed to log user message:', userMsgError)

    // 6b. Log Assistant Response
    const { error: asstMsgError } = await supabase.from('vehicle_chat_history').insert({
      device_id: target_device_id,
      user_id: user_id,
      role: 'assistant',
      content: finalResponseText,
      // created_at defaults to now()
    })

    if (asstMsgError) console.error('Failed to log assistant message:', asstMsgError)

    // 7. Learn Preferences (Async)
    // Note: We don't await this to speed up response time, unless necessary
    // But since this is an Edge Function, we should await or use Edge Runtime background tasks (if supported).
    // Deno/Supabase functions usually kill the process after response return, so we MUST await.
    await learnAndGetPreferences(supabase, user_id, message, conversationContext.recent_messages) // FIXED: Use user_id

    return new Response(JSON.stringify({
      text: finalResponseText,
      conversation_id,
      query_type: queryType,
      metadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Error in handler:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

Deno.serve(handler)
