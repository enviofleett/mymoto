import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildConversationContext, callLovableAPI, buildSystemPrompt } from './conversation-manager.ts'
import { learnAndGetPreferences, buildPreferenceContext, getUserPreferences } from './preference-learner.ts'
import { extractDateContext } from './date-extractor.ts'
import { TOOLS, TOOLS_SCHEMA } from './tools.ts'
import { classifyIntent } from './intent-classifier.ts'
import { parseCommand } from './command-parser.ts'

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
    user_id: req_user_id, // Dev-only override (gated by env flag)
  } = await req.json()

  // Standardize on device_id (matching frontend)
  let target_device_id = device_id || req_vehicle_id

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY_JWT') || ''

  const supabase = createClient(supabaseUrl, serviceKey)
  const supabaseAuth = createClient(supabaseUrl, anonKey)

  // NOTE: device name resolution is handled after we authenticate and authorize the caller,
  // so we can scope lookup to vehicles they can access.

  // Get User ID from Auth Header
  const authHeader = req.headers.get('Authorization')
  let user_id: string | null = null
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    // Validate caller using anon client so JWT validation is scoped to the project.
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
    if (user) {
      user_id = user.id
    } else {
      console.warn('User authentication failed:', error)
    }
  }

  // Fallback: Use request body user_id (useful for testing or service-role calls)
  const allowUserIdOverride = (Deno.env.get('ALLOW_USER_ID_OVERRIDE') || '').toLowerCase() === 'true'
  if (!user_id && req_user_id && allowUserIdOverride) {
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
    // ------------------------------------------------------------------------
    // Authorization: ensure caller can access this vehicle (admin or assigned)
    // ------------------------------------------------------------------------
    const { data: isAdmin, error: isAdminError } = await supabase.rpc('has_role', {
      _user_id: user_id,
      _role: 'admin',
    })
    if (isAdminError) {
      console.warn('[AuthZ] has_role RPC failed:', isAdminError)
    }

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

    // Device ID Resolution: If input is a name (e.g., "RBC784CX"), resolve to ID.
    // IMPORTANT: resolution must be scoped to caller access (admin: any; non-admin: assigned only).
    if (target_device_id && !/^\d+$/.test(target_device_id)) {
      console.log(`[Handler] Resolving device name to device_id: ${target_device_id}`)

      if (isAdmin) {
        const { data: vehicles } = await supabase
          .from('vehicles')
          .select('device_id')
          .ilike('device_name', target_device_id)
          .limit(1)
        if (vehicles && vehicles.length > 0) {
          target_device_id = vehicles[0].device_id
        }
      } else {
        const { data: assignments } = await supabase
          .from('vehicle_assignments')
          .select('device_id, vehicles!inner(device_id, device_name)')
          .eq('vehicles.device_name', target_device_id)
          .limit(1)
        if (assignments && assignments.length > 0) {
          target_device_id = assignments[0].device_id
        }
      }
    }

    // Enforce assignment for non-admins
    if (!isAdmin) {
      const { data: ok } = await supabase
        .from('vehicle_assignments')
        .select('device_id, profiles!inner(user_id)')
        .eq('device_id', target_device_id)
        .eq('profiles.user_id', user_id)
        .limit(1)
        .maybeSingle()

      if (!ok) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: not assigned to this vehicle' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

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
2. Trip History: 'get_trip_history' queries the raw 'gps51_trips' source of truth. If it returns 0 trips, verify with 'get_position_history' before claiming "no movement".
3. Position History: 'get_position_history' queries raw GPS points - use for "where was I at [time]?" or detailed movement tracking.
4. Alarms: 'create_geofence_alert' sets up monitoring.
5. IMPORTANT: You CAN access history ('get_trip_history' and 'get_position_history') even if 'get_vehicle_status' says "offline". Offline only means "no live GPS", not "database is down".
6. SHORT TRIPS: If 'get_trip_history' returns "Short Trip" entries, mention them if relevant (e.g. "I moved a short distance"). Do not ignore them unless clearly requested to show only long trips.

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

    let alertsSystemInfo = ''
    const alerts = conversationContext.recent_proactive_alerts || []
    if (alerts.length > 0) {
      const lines = alerts.map((a, index) => {
        const severity = a.severity || ''
        const title = a.title || ''
        const messageText = a.message || ''
        const createdAt = a.created_at || ''
        return `${index + 1}. [${severity}] ${title} - ${messageText} (${createdAt})`
      })
      alertsSystemInfo = `

RECENT PROACTIVE ALERTS (You sent these recently):
${lines.join('\n')}
If the user asks about these alerts, provide context and recommendations.`
    }

    let alertsSummarySystemInfo = ''
    if (conversationContext.recent_proactive_alerts_summary) {
      alertsSummarySystemInfo = `

ALERT SUMMARY:
${conversationContext.recent_proactive_alerts_summary}
When the user asks about recent issues, use this as a quick overview before diving into details.`
    }

    const preferencesRaw: any = preferenceContextRaw || {}
    const proactiveUpdatesPref = preferencesRaw.proactive_updates
    const alertSeverityPref = preferencesRaw.alert_severity

    let proactiveRulesInfo = ''

    if (proactiveUpdatesPref || alertSeverityPref) {
      const proactiveLine = proactiveUpdatesPref
        ? (proactiveUpdatesPref.value
            ? 'User wants proactive updates when it is genuinely helpful.'
            : 'User prefers only direct answers to their questions. Avoid unsolicited suggestions.')
        : null

      let severityLine: string | null = null
      if (alertSeverityPref) {
        if (alertSeverityPref.value === 'critical_only') {
          severityLine = 'Only emphasize CRITICAL alerts unless the user explicitly asks for minor ones.'
        } else if (alertSeverityPref.value === 'all') {
          severityLine = 'It is okay to mention minor alerts as well as critical ones.'
        }
      }

      const lines: string[] = []
      if (proactiveLine) lines.push(`- ${proactiveLine}`)
      if (severityLine) lines.push(`- ${severityLine}`)

      if (lines.length > 0) {
        proactiveRulesInfo = `

ALERT PREFERENCE RULES:
${lines.join('\n')}
Only propose follow-up actions or extra monitoring if this matches these preferences.`
      }
    }

    const finalSystemPrompt = `${systemPersona}\n${dateSystemInfo}${alertsSystemInfo}${alertsSummarySystemInfo}${proactiveRulesInfo}`

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
    let handledDeterministically = false

    // ------------------------------------------------------------------------
    // Deterministic prefetch: fetch the right data before the LLM answers.
    // This dramatically reduces hallucinations and ensures consistency with the PWA.
    // ------------------------------------------------------------------------
    const intent = classifyIntent(message)
    metadata.intent = intent
    metadata.date_context = dateContext

    const prefetched: any[] = []
    try {
      // Control commands: short-circuit with a structured confirmation response.
      if (intent.type === 'control') {
        const parsed = parseCommand(message)
        metadata.parsed_command = parsed
        if (parsed.isCommand) {
          // Let the UI do confirmations/execution; agent only prepares the command.
          finalResponseText = JSON.stringify({
            action: 'confirmation_required',
            command: parsed.commandType,
            parameters: parsed.parameters,
            message: 'Command prepared. Please confirm in the dashboard to execute.'
          })
          queryType = 'control_command'
          // Skip the LLM loop entirely.
          turnCount = 0
        }
      }

      if (turnCount === 0 && queryType === 'control_command') {
        // no-op, handled above
      } else {
        const wantsLive = intent.requires_fresh_data || /\b(right\s+now|live|current)\b/i.test(message)
        if (wantsLive) {
          const syncTool = TOOLS.find(t => t.name === 'force_sync_gps51')
          if (syncTool) {
            const r = await syncTool.execute({ reason: 'user requested live/current data' }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'force_sync_gps51', result: r })
          }
          const statusTool = TOOLS.find(t => t.name === 'get_vehicle_status')
          if (statusTool) {
            const r = await statusTool.execute({ check_freshness: true }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_vehicle_status', result: r })
          }
        }

        if (intent.type === 'trip' || intent.type === 'history') {
          const tool = TOOLS.find(t => t.name === 'get_trip_history')
          if (tool) {
            const r = await tool.execute({ start_date: dateContext.startDate, end_date: dateContext.endDate }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_trip_history', result: r })
            // If no trips, verify with position history before claiming "no movement".
            if (r?.summary?.count === 0 || r?.trips?.length === 0) {
              const posTool = TOOLS.find(t => t.name === 'get_position_history')
              if (posTool) {
                const pr = await posTool.execute({ start_time: dateContext.startDate, end_time: dateContext.endDate, limit: 200 }, { supabase, device_id: target_device_id })
                prefetched.push({ tool: 'get_position_history', result: pr })
              }
            }
          }
        } else if (intent.type === 'stats') {
          const tool = TOOLS.find(t => t.name === 'get_trip_analytics')
          if (tool) {
            const r = await tool.execute({ period: dateContext.period, start_date: dateContext.startDate, end_date: dateContext.endDate }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_trip_analytics', result: r })
          }
        } else if (intent.type === 'maintenance') {
          const alertsTool = TOOLS.find(t => t.name === 'get_recent_alerts')
          if (alertsTool) {
            const r = await alertsTool.execute({ limit: 5 }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_recent_alerts', result: r })
          }
          const healthTool = TOOLS.find(t => t.name === 'get_vehicle_health')
          if (healthTool) {
            const r = await healthTool.execute({ check_freshness: true }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_vehicle_health', result: r })
          }
        } else if (intent.type === 'alert_explanation') {
          const alertsTool = TOOLS.find(t => t.name === 'get_recent_alerts')
          if (alertsTool) {
            const r = await alertsTool.execute({ limit: 20 }, { supabase, device_id: target_device_id })
            prefetched.push({ tool: 'get_recent_alerts', result: r })
          }
        }
      }
    } catch (e: any) {
      console.warn('[Agent] Prefetch failed:', e?.message || e)
    }

    if (prefetched.length > 0) {
      metadata.prefetched = prefetched
      const tripHistoryPrefetch = prefetched.find(p => p.tool === 'get_trip_history')
      const positionHistoryPrefetch = prefetched.find(p => p.tool === 'get_position_history')
      const tripAnalyticsPrefetch = prefetched.find(p => p.tool === 'get_trip_analytics')

      if ((intent.type === 'trip' || intent.type === 'history') && tripHistoryPrefetch) {
        metadata.get_trip_history = tripHistoryPrefetch.result
        if (positionHistoryPrefetch) {
          metadata.get_position_history = positionHistoryPrefetch.result
        }

        const summary = tripHistoryPrefetch.result?.summary
        const trips = tripHistoryPrefetch.result?.trips || []
        const tripCount = summary?.count ?? trips.length ?? 0
        const distanceKm = summary?.total_distance_km ?? trips.reduce((sum: number, t: any) => sum + (t.distance_km || 0), 0)

        if (tripCount === 0) {
          const positionSummary = positionHistoryPrefetch?.result?.summary
          const movedDistance = positionSummary?.movement?.approximate_distance_km ?? 0
          if (movedDistance > 0) {
            finalResponseText = `I do not have any completed trips recorded for ${dateContext.humanReadable}, but raw GPS points show about ${movedDistance} km of movement. This usually means trips are still being processed or were too short to segment.`
          } else {
            finalResponseText = `I do not see any trips or movement for ${dateContext.humanReadable}.`
          }
        } else if (dateContext.period === 'last_trip' || /last trip|latest trip|most recent trip/i.test(message)) {
          const lastTrip = trips[trips.length - 1]
          const from = lastTrip?.from || 'Unknown location'
          const to = lastTrip?.to || 'Unknown location'
          const lastDist = lastTrip?.distance_km ?? 0
          const lastDurMin = lastTrip?.duration_min ?? null
          const durationText = lastDurMin != null ? `${lastDurMin} minutes` : 'an unknown duration'
          finalResponseText = `My last trip went from ${from} to ${to} covering about ${Math.round(lastDist * 10) / 10} km over ${durationText}.`
        } else {
          const distanceText = Math.round(distanceKm * 10) / 10
          const periodText = dateContext.humanReadable || 'that period'
          if (tripCount === 1) {
            const t = trips[0]
            const from = t?.from || 'Unknown location'
            const to = t?.to || 'Unknown location'
            const durMin = t?.duration_min ?? null
            const durText = durMin != null ? `${durMin} minutes` : 'an unknown duration'
            finalResponseText = `You had 1 trip ${periodText} from ${from} to ${to}, about ${Math.round((t?.distance_km || distanceKm) * 10) / 10} km over ${durText}.`
          } else {
            finalResponseText = `You had ${tripCount} trips ${periodText}, covering about ${distanceText} km in total.`
          }
        }

        queryType = 'trip_history'
        handledDeterministically = true
      } else if (intent.type === 'stats' && tripAnalyticsPrefetch) {
        metadata.get_trip_analytics = tripAnalyticsPrefetch.result
        const summary = tripAnalyticsPrefetch.result?.summary
        const periodInfo = tripAnalyticsPrefetch.result?.period
        const totalTrips = summary?.total_trips ?? 0
        const totalDistance = summary?.total_distance_km ?? 0
        const driveTime = summary?.total_drive_time ?? null
        const parkingTime = summary?.total_parking_time ?? null
        const periodLabel = dateContext.humanReadable || periodInfo?.name || 'that period'

        if (totalTrips === 0) {
          finalResponseText = `I do not see any completed trips for ${periodLabel}.`
        } else {
          const distText = Math.round(totalDistance * 10) / 10
          if (driveTime && parkingTime) {
            finalResponseText = `For ${periodLabel}, you had ${totalTrips} trips, drove about ${distText} km, spent ${driveTime} driving and about ${parkingTime} parked between trips.`
          } else if (driveTime) {
            finalResponseText = `For ${periodLabel}, you had ${totalTrips} trips and drove about ${distText} km over ${driveTime}.`
          } else {
            finalResponseText = `For ${periodLabel}, you had ${totalTrips} trips and drove about ${distText} km.`
          }
        }

        queryType = 'trip_stats'
        handledDeterministically = true
      } else if (intent.type === 'alert_explanation') {
        const alertsPrefetch = prefetched.find(p => p.tool === 'get_recent_alerts')
        const recentAlertsData = alertsPrefetch ? alertsPrefetch.result : null

        const alertItems = Array.isArray(recentAlertsData?.alerts)
          ? (recentAlertsData.alerts as any[])
          : []

        const summaryLine = conversationContext.weekly_alert_pattern_summary
          || conversationContext.recent_proactive_alerts_summary

        if (alertItems.length === 0 && !summaryLine) {
          finalResponseText = 'I do not see any recent alerts for this vehicle in the last few days.'
        } else if (alertItems.length === 0 && summaryLine) {
          finalResponseText = `${summaryLine} I do not have any additional alert records to break down right now.`
        } else {
          const topCount = Math.min(alertItems.length, 5)
          const lines: string[] = []
          for (let i = 0; i < topCount; i++) {
            const item = alertItems[i]
            const severity = item.severity || 'info'
            const title = item.title || item.event_type || 'Alert'
            const createdAt = item.created_at || ''
            lines.push(`${i + 1}. [${severity}] ${title} at ${createdAt}`)
          }

          const intro = summaryLine
            ? `${summaryLine} Here is a quick breakdown of the most recent alerts:\n`
            : 'Here is a quick breakdown of your most recent alerts:\n'

          finalResponseText = `${intro}${lines.join('\n')}\nIf you want more detail about any specific alert, ask about its time or title.`
        }

        queryType = 'alert_explanation'
        handledDeterministically = true
      }

      if (!handledDeterministically) {
        messages.splice(1, 0, {
          role: 'assistant',
          content: `Tool results (prefetched):\n${JSON.stringify(prefetched).slice(0, 12000)}`
        })
      }
    }
    
    if (!handledDeterministically && queryType !== 'control_command') {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        turnCount = turn + 1
        console.log(`[Agent] Turn ${turn + 1}`)
        
        const llmResponse = await callLovableAPI(messages, undefined, {
          tools: TOOLS_SCHEMA,
          tool_choice: 'auto'
        })

        if (llmResponse.text) {
          messages.push({ role: 'assistant', content: llmResponse.text })
        }

        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          queryType = 'agent_action'
          
          const assistantMsg: any = { role: 'assistant', content: llmResponse.text || null, tool_calls: llmResponse.tool_calls }
          
          if (llmResponse.text) {
            messages.pop()
          }
          messages.push(assistantMsg)

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
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult)
            })
            
            metadata[functionName] = toolResult
          }
        } else {
          finalResponseText = llmResponse.text || "I didn't receive a response."
          break
        }
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
