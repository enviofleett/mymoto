/**
 * Proactive Alarm to Chat Edge Function
 * 
 * This function is triggered when a new proactive_vehicle_event is created.
 * It generates a natural language message using LLM with the vehicle's personality,
 * and posts it to the vehicle's chat history.
 * 
 * Features:
 * - Uses vehicle's personality mode (casual, professional, funny)
 * - Uses vehicle's language preference
 * - Generates context-aware messages
 * - Includes location tags for map rendering
 * - Marks messages as proactive (is_proactive: true)
 */

// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM } from '../_shared/llm-client.ts';

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  description?: string;
  metadata: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  created_at: string;
}

// Replaced by callLLM from shared client
const callGeminiAPI = callLLM;

/**
 * Generate proactive message using LLM with vehicle personality
 */
async function generateProactiveMessage(
  supabase: any,
  event: ProactiveEvent,
  vehicleNickname: string,
  personalityMode: string,
  languagePref: string
): Promise<string> {

  // Language instructions
  const languageInstructions: Record<string, string> = {
    english: 'Respond in clear, conversational English. Be natural and direct. Use contractions. NEVER switch languages even if the user asks.',
    pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala", "E dey work well well", "Na so e be o", "Oya make we go". Be warm, relatable, and authentically Nigerian. NEVER switch to standard English or any other language even if the user asks.',
    yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́", "Ó dàbọ̀". Only use English for technical terms. Be respectful and warm. NEVER switch languages even if the user asks.',
    hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai", "Lafiya lau". Only use English for technical terms. Be respectful. NEVER switch languages even if the user asks.',
    igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu", "Nnọọ". Only use English for technical terms. Be warm. NEVER switch languages even if the user asks.',
    french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières comme "Ça roule!", "Pas de souci", "Nickel", "Tranquille", "On est bon". Tutoie l\'utilisateur. Sois décontracté, pas scolaire. NE change JAMAIS de langue même si l\'utilisateur le demande.',
  };

  // Personality instructions
  const personalityInstructions: Record<string, string> = {
    casual: 'Be chill and friendly. Talk like a trusted buddy. Use contractions.',
    professional: 'Be crisp, efficient, and direct. No fluff.',
    funny: `Be SASSY and witty! Make car puns freely. Use light sarcasm and jokes. Be entertaining but helpful.`,
  };

  const languageInstruction = languageInstructions[languagePref.toLowerCase()] || languageInstructions.english;
  const personalityInstruction = personalityInstructions[personalityMode.toLowerCase()] || personalityInstructions.casual;

  // Build location context
  let locationContext = '';
  if (event.latitude && event.longitude) {
    const address = event.location_name || `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`;
    locationContext = `\n\nLocation: [LOCATION: ${event.latitude}, ${event.longitude}, "${address}"]`;
  }

  // Build severity emoji
  const severityEmojis: Record<string, string> = {
    critical: '🚨',
    error: '⚠️',
    warning: '⚡',
    info: 'ℹ️',
  };
  const emoji = severityEmojis[event.severity] || 'ℹ️';

  const systemPrompt = `You are "${vehicleNickname}", a vehicle with a ${personalityMode} personality.
You need to proactively alert your owner about an issue.
${languageInstruction}
${personalityInstruction}

CRITICAL RULES:
- Speak in FIRST PERSON as the vehicle: "I'm...", "My battery is...", "I'm at..."
- Be DIRECT — just state the issue, no preamble
- Keep it SHORT — under 40 words
- Be NATURAL — like texting a friend, not a helpdesk
- Do NOT say "I noticed" or "I detected" — just state it naturally
- Use the severity emoji: ${emoji}

FORBIDDEN PHRASES:
❌ "I noticed that..."
❌ "I detected..."
❌ "I want to inform you..."
❌ "As an AI..."
❌ "I can help you with that..."

REQUIRED STYLE:
✓ First person, natural, ${personalityMode} tone
✓ Direct and helpful
✓ Include location if available`;

  const userPrompt = `Generate a proactive alert message for this situation:

Event: ${event.title}
Details: ${event.description || event.message}
Severity: ${event.severity}
Type: ${event.event_type}
${event.metadata ? `Context: ${JSON.stringify(event.metadata)}` : ''}

Write a short, natural message from the vehicle's perspective.${locationContext}`;

  try {
    // Use shared Gemini client (automatically uses direct Gemini or Lovable fallback)
    console.log('[proactive-alarm-to-chat] Calling Gemini API via shared client');
    
    const result = await callGeminiAPI(systemPrompt, userPrompt, {
      maxOutputTokens: 150,
      temperature: 0.7,
      model: 'google/gemini-2.5-flash',
    });
    
    let message = result.text || event.message;
    
    if (!message || message === event.message) {
      console.warn('[proactive-alarm-to-chat] Empty response from API, using fallback');
      throw new Error('Empty response from API');
    }

    // Add emoji prefix
    if (!message.startsWith(emoji)) {
      message = `${emoji} ${message}`;
    }

    // Add location tag if available
    if (event.latitude && event.longitude && !message.includes('[LOCATION:')) {
      const address = event.location_name || `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`;
      message += `\n\n[LOCATION: ${event.latitude}, ${event.longitude}, "${address}"]`;
    }

    return message;
  } catch (error) {
    // Log full error details for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('[proactive-alarm-to-chat] LLM generation error:', {
      message: errorMessage,
      stack: errorStack,
      errorType: error?.constructor?.name,
      errorString: String(error),
    });
    
    // Fallback: Simple formatted message
    let fallbackMessage = `${emoji} ${event.title}`;
    if (event.description) {
      fallbackMessage += `: ${event.description}`;
    } else {
      fallbackMessage += `: ${event.message}`;
    }

    if (event.latitude && event.longitude) {
      const address = event.location_name || `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`;
      fallbackMessage += `\n\n[LOCATION: ${event.latitude}, ${event.longitude}, "${address}"]`;
    }

    return fallbackMessage;
  }
}

/**
 * Get vehicle assignments for an event
 * Returns list of user_ids who should receive this alert
 */
async function getVehicleAssignments(supabase: any, deviceId: string): Promise<string[]> {
  const { data: assignments, error } = await supabase
    .from('vehicle_assignments')
    .select(`
      profile_id,
      profiles:profile_id (
        user_id
      )
    `)
    .eq('device_id', deviceId);

  if (error) {
    console.error('[proactive-alarm-to-chat] Error fetching assignments:', error);
    return [];
  }

  return (assignments || [])
    .map((a: any) => a.profiles?.user_id)
    .filter(Boolean) as string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let proactiveEvent: ProactiveEvent | undefined;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get event from request body
    // When called from Supabase Database Webhook (Edge Functions type), the data structure is different
    const body = await req.json();
    console.log('[proactive-alarm-to-chat] Received request body:', JSON.stringify(body, null, 2));

    // Handle different webhook formats:
    // 1. Supabase Edge Functions webhook format: { type: 'INSERT', table: '...', record: {...}, old_record: null }
    // 2. Manual HTTP request format: { event: {...} }
    
    if (body.record) {
      // Format from Supabase Database Webhook (Edge Functions type)
      console.log('[proactive-alarm-to-chat] Using webhook format (record)');
      proactiveEvent = {
        id: body.record.id,
        device_id: body.record.device_id,
        event_type: body.record.event_type,
        severity: body.record.severity,
        title: body.record.title,
        message: body.record.message || body.record.title || '',
        description: body.record.description,
        metadata: body.record.metadata || {},
        latitude: body.record.latitude,
        longitude: body.record.longitude,
        location_name: body.record.location_name,
        created_at: body.record.created_at || new Date().toISOString(),
      };
    } else if (body.event) {
      // Format from manual HTTP request or custom webhook
      console.log('[proactive-alarm-to-chat] Using manual format (event)');
      proactiveEvent = body.event as ProactiveEvent;
    } else {
      // Try to use body directly if it has the required fields
      if (body.device_id) {
        console.log('[proactive-alarm-to-chat] Using direct body format');
        proactiveEvent = body as ProactiveEvent;
      } else {
        throw new Error('Missing event data: Expected "record", "event", or direct event object');
      }
    }

    if (!proactiveEvent || !proactiveEvent.device_id) {
      throw new Error('Missing event data: device_id is required');
    }
    console.log(`[proactive-alarm-to-chat] Processing event: ${proactiveEvent.id} for device: ${proactiveEvent.device_id}`);

    // CRITICAL FIX: Early deduplication check - skip if already notified
    // This prevents duplicate processing if trigger fires multiple times
    if (proactiveEvent.id) {
      const { data: existingEvent, error: checkError } = await supabase
        .from('proactive_vehicle_events')
        .select('id, notified, notified_at')
        .eq('id', proactiveEvent.id)
        .maybeSingle();

      if (checkError) {
        console.warn('[proactive-alarm-to-chat] Could not check notified status (non-critical):', checkError.message);
      } else if (existingEvent?.notified === true) {
        console.log(`[proactive-alarm-to-chat] Event ${proactiveEvent.id} already notified at ${existingEvent.notified_at}, skipping duplicate`);
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Event already notified',
          event_id: proactiveEvent.id,
          skipped: true
        }), {
          status: 200, // 200 because this is expected behavior, not an error
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('device_id, device_name, vehicle_status')
      .eq('device_id', proactiveEvent.device_id)
      .maybeSingle();

    if (!vehicle) {
      console.warn(`[proactive-alarm-to-chat] Vehicle not found: ${proactiveEvent.device_id}`);
      return new Response(JSON.stringify({ success: false, error: 'Vehicle not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (vehicle.vehicle_status === 'hibernated') {
      console.log(`[proactive-alarm-to-chat] Vehicle ${proactiveEvent.device_id} is hibernated, skipping chat notification.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'vehicle_hibernated' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get LLM settings for personality
    const { data: llmSettings } = await supabase
      .from('vehicle_llm_settings')
      .select('nickname, personality_mode, language_preference')
      .eq('device_id', proactiveEvent.device_id)
      .maybeSingle();

    const vehicleNickname = llmSettings?.nickname || vehicle.device_name || proactiveEvent.device_id;
    const personalityMode = (llmSettings?.personality_mode || 'casual').toLowerCase().trim();
    const languagePref = (llmSettings?.language_preference || 'english').toLowerCase().trim();

    // Get vehicle assignments to determine which users should receive this
    const userIds = await getVehicleAssignments(supabase, proactiveEvent.device_id);

    if (userIds.length === 0) {
      console.warn(`[proactive-alarm-to-chat] No users assigned to device ${proactiveEvent.device_id}. Skipping.`);
      return new Response(JSON.stringify({ success: false, message: 'No assigned users' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check wallet balance for assigned users
    // At least one user must have positive balance to trigger LLM
    const { data: eligibleWallets, error: walletError } = await supabase
      .from('wallets')
      .select('user_id')
      .in('user_id', userIds)
      .gt('balance', 0);

    const eligibleUserIds = eligibleWallets?.map((w: any) => w.user_id) || [];

    if (eligibleUserIds.length === 0) {
      console.warn(`[proactive-alarm-to-chat] No assigned users have positive wallet balance. Skipping LLM generation.`);
      // We can still send a basic notification if needed, but for "Proactive Chat" which implies AI, we skip.
      // Or we could send a fallback non-AI message? 
      // The requirement says "users without wallet credit wont be able to use the LLM services".
      // So we should strictly skip the LLM part.
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Insufficient wallet balance for all assigned users',
        skipped: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[proactive-alarm-to-chat] ${eligibleUserIds.length} users have positive balance. Proceeding with LLM.`);

    // Generate proactive message using LLM
    const chatMessage = await generateProactiveMessage(
      supabase,
      proactiveEvent,
      vehicleNickname,
      personalityMode,
      languagePref
    );

    // Map event_type to preference key (for push/sound notifications)
    const eventTypeToPreference: Record<string, string> = {
      'low_battery': 'low_battery',
      'critical_battery': 'critical_battery',
      'overspeeding': 'overspeeding',
      'harsh_braking': 'harsh_braking',
      'rapid_acceleration': 'rapid_acceleration',
      'ignition_on': 'ignition_on',
      'ignition_off': 'ignition_off',
      'geofence_enter': 'geofence_enter',
      'geofence_exit': 'geofence_exit',
      'idle_too_long': 'idle_too_long',
      'offline': 'offline',
      'online': 'online',
      'maintenance_due': 'maintenance_due',
      'trip_completed': 'trip_completed',
      'anomaly_detected': 'anomaly_detected',
    };

    const preferenceKey = eventTypeToPreference[proactiveEvent.event_type];

    // Check AI Chat preferences (separate from push/sound notifications)
    // Only create chat messages if AI Chat is enabled for this event type
    const aiChatPreferenceKey = preferenceKey ? `enable_ai_chat_${preferenceKey}` : null;
    let aiChatEnabledUserIds: string[] = [];

    if (aiChatPreferenceKey) {
      const { data: aiChatPrefs, error: aiChatPrefsError } = await supabase
        .from('vehicle_notification_preferences')
        .select(`user_id, ${aiChatPreferenceKey}`)
        .eq('device_id', proactiveEvent.device_id)
        .in('user_id', userIds);

      if (aiChatPrefsError) {
        console.error('[proactive-alarm-to-chat] Error fetching AI Chat preferences:', aiChatPrefsError);
        // If error, check defaults: critical events are enabled by default for AI chat
        const defaultEnabled = ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due'].includes(proactiveEvent.event_type);
        if (defaultEnabled) {
          aiChatEnabledUserIds = userIds; // Use all users for default-enabled events
        }
      } else {
        // Filter users who have AI Chat enabled for this event
        aiChatEnabledUserIds = (aiChatPrefs || [])
          .filter((pref: any) => {
            // If explicitly false, skip
            if (pref[aiChatPreferenceKey] === false) return false;
            // If explicitly true, include
            if (pref[aiChatPreferenceKey] === true) return true;
            // Default: critical events enabled
            return ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due'].includes(proactiveEvent!.event_type);
          })
          .map((pref: any) => pref.user_id);

        // If no preferences exist, use defaults
        if (aiChatPrefs.length === 0) {
          const defaultEnabled = ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due'].includes(proactiveEvent!.event_type);
          if (defaultEnabled) {
            aiChatEnabledUserIds = userIds; // Use all users for default-enabled events
          }
        }
      }
    } else {
      // If no preference key mapped, default: critical events enabled
      const defaultEnabled = ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due'].includes(proactiveEvent!.event_type);
      if (defaultEnabled) {
        aiChatEnabledUserIds = userIds;
      }
    }

    // If no users have AI Chat enabled, skip creating chat messages
    if (aiChatEnabledUserIds.length === 0) {
      console.log(`[proactive-alarm-to-chat] No users have AI Chat enabled for ${proactiveEvent!.event_type} on vehicle ${proactiveEvent!.device_id}, skipping chat message creation.`);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No users have AI Chat enabled for this event',
        note: 'Push notifications are handled separately'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use AI Chat enabled users for chat messages
    // Note: Push/sound notification preferences are checked separately (not in this function)
    const enabledUserIds: string[] = aiChatEnabledUserIds;

    // Insert proactive message into chat history for each enabled user
    const insertPromises = enabledUserIds.map((userId) =>
      supabase.from('vehicle_chat_history').insert({
        device_id: proactiveEvent!.device_id,
        user_id: userId,
        role: 'assistant',
        content: chatMessage,
        is_proactive: true,
        alert_id: proactiveEvent!.id,
        created_at: proactiveEvent!.created_at,
      })
    );

    const results = await Promise.allSettled(insertPromises);
    const errors = results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason);
    const successfulInserts = results.filter((r) => r.status === 'fulfilled').length;

    if (errors.length > 0) {
      console.error('[proactive-alarm-to-chat] Some inserts failed:', errors);
      // If some inserts failed, we still mark as notified to prevent retries
      // The successful inserts are already posted
    }

    // CRITICAL FIX: Mark event as notified after successful posting
    // This prevents duplicate notifications if trigger fires again
    // Only mark as notified if at least one message was successfully posted
    if (successfulInserts > 0) {
      try {
        // Check if notified column exists before updating
        const { error: updateError } = await supabase
          .from('proactive_vehicle_events')
          .update({ 
            notified: true, 
            notified_at: new Date().toISOString() 
          })
          .eq('id', proactiveEvent!.id);

        if (updateError) {
          // Column might not exist, log but don't fail
          console.warn('[proactive-alarm-to-chat] Could not update notified column (may not exist):', updateError.message);
        } else {
          console.log(`[proactive-alarm-to-chat] Marked event ${proactiveEvent!.id} as notified`);
        }
      } catch (updateErr) {
        // Silently handle if column doesn't exist
        console.warn('[proactive-alarm-to-chat] Notified column update failed (non-critical):', updateErr);
      }
    } else {
      // No successful inserts - don't mark as notified so it can be retried
      console.error(`[proactive-alarm-to-chat] No messages posted for event ${proactiveEvent!.id}, not marking as notified`);
    }

    console.log(`[proactive-alarm-to-chat] Successfully posted proactive message for event ${proactiveEvent!.id} (${successfulInserts}/${enabledUserIds.length} users)`);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: proactiveEvent!.id,
        device_id: proactiveEvent!.device_id,
        message_posted: chatMessage.substring(0, 100) + '...',
        users_notified: successfulInserts,
        users_total: enabledUserIds.length,
        errors: errors.length > 0 ? errors.length : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Enhanced error handling with detailed logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('[proactive-alarm-to-chat] Error processing event:', {
      event_id: proactiveEvent?.id,
      device_id: proactiveEvent?.device_id,
      error: errorMessage,
      stack: errorStack,
      error_type: error?.constructor?.name,
    });

    // Log error to database for monitoring (if table exists)
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Try to log error to a monitoring table (optional, won't fail if table doesn't exist)
      await supabase.from('edge_function_errors').insert({
        function_name: 'proactive-alarm-to-chat',
        event_id: proactiveEvent?.id,
        device_id: proactiveEvent?.device_id,
        error_message: errorMessage,
        error_stack: errorStack,
        created_at: new Date().toISOString(),
      }).catch(() => {
        // Silently fail if table doesn't exist - this is optional monitoring
      });
    } catch (logError) {
      // Ignore logging errors
      console.warn('[proactive-alarm-to-chat] Could not log error to database:', logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        event_id: proactiveEvent?.id,
        device_id: proactiveEvent?.device_id,
        retry_recommended: true, // Indicate that this can be retried
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
