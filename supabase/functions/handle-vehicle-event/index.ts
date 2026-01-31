/**
 * Handle Vehicle Event - Proactive AI Conversations
 * 
 * This function is triggered when a new proactive_vehicle_event is created.
 * It checks user preferences and generates AI conversations for enabled event types.
 * 
 * Triggered via: Database Webhook on proactive_vehicle_events INSERT
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Inlined Embedding Generator (for Dashboard deployment compatibility)
const DOMAIN_VOCABULARY: Record<string, { weight: number; category: string }> = {
  'driving': { weight: 1.0, category: 'behavior' },
  'braking': { weight: 1.2, category: 'behavior' },
  'acceleration': { weight: 1.2, category: 'behavior' },
  'cornering': { weight: 1.1, category: 'behavior' },
  'speeding': { weight: 1.3, category: 'behavior' },
  'overspeeding': { weight: 1.4, category: 'behavior' },
  'harsh': { weight: 1.3, category: 'behavior' },
  'smooth': { weight: 1.0, category: 'behavior' },
  'aggressive': { weight: 1.2, category: 'behavior' },
  'safe': { weight: 1.1, category: 'behavior' },
  'score': { weight: 1.2, category: 'performance' },
  'rating': { weight: 1.1, category: 'performance' },
  'performance': { weight: 1.0, category: 'performance' },
  'yesterday': { weight: 1.2, category: 'time' },
  'today': { weight: 1.0, category: 'time' },
  'week': { weight: 1.1, category: 'time' },
  'month': { weight: 1.2, category: 'time' },
  'last': { weight: 0.8, category: 'time' },
  'history': { weight: 1.1, category: 'time' },
  'trip': { weight: 1.2, category: 'trip' },
  'trips': { weight: 1.2, category: 'trip' },
  'journey': { weight: 1.1, category: 'trip' },
  'travel': { weight: 1.0, category: 'trip' },
  'distance': { weight: 1.0, category: 'trip' },
  'mileage': { weight: 1.1, category: 'trip' },
  'kilometer': { weight: 0.9, category: 'trip' },
  'km': { weight: 0.9, category: 'trip' },
  'location': { weight: 1.1, category: 'location' },
  'where': { weight: 1.2, category: 'location' },
  'home': { weight: 1.0, category: 'location' },
  'work': { weight: 1.0, category: 'location' },
  'office': { weight: 1.0, category: 'location' },
  'arrived': { weight: 1.0, category: 'location' },
  'left': { weight: 1.0, category: 'location' },
  'parked': { weight: 1.0, category: 'location' },
  'battery': { weight: 1.2, category: 'status' },
  'fuel': { weight: 1.1, category: 'status' },
  'engine': { weight: 1.1, category: 'status' },
  'ignition': { weight: 1.0, category: 'status' },
  'online': { weight: 1.0, category: 'status' },
  'offline': { weight: 1.0, category: 'status' },
  'speed': { weight: 1.1, category: 'status' },
  'moving': { weight: 1.0, category: 'status' },
  'stopped': { weight: 1.0, category: 'status' },
  'lock': { weight: 1.3, category: 'command' },
  'unlock': { weight: 1.3, category: 'command' },
  'alert': { weight: 1.2, category: 'command' },
  'notify': { weight: 1.1, category: 'command' },
};

const CATEGORY_RANGES: Record<string, [number, number]> = {
  'behavior': [0, 200],
  'performance': [200, 350],
  'time': [350, 500],
  'trip': [500, 650],
  'location': [650, 800],
  'status': [800, 950],
  'command': [950, 1100],
  'general': [1100, 1536],
};

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function generateTextEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  
  for (const [word, count] of wordCounts) {
    const vocabEntry = DOMAIN_VOCABULARY[word];
    
    if (vocabEntry) {
      const [start, end] = CATEGORY_RANGES[vocabEntry.category];
      const range = end - start;
      const hash = hashString(word);
      const positions = 15;
      
      for (let i = 0; i < positions; i++) {
        const pos = start + ((hash + i * 97) % range);
        const weight = vocabEntry.weight * Math.log2(count + 1);
        embedding[pos] += weight * Math.cos(i * 0.4);
      }
    } else {
      const [start, end] = CATEGORY_RANGES['general'];
      const range = end - start;
      const hash = hashString(word);
      
      for (let i = 0; i < 5; i++) {
        const pos = start + ((hash + i * 31) % range);
        embedding[pos] += 0.3 * Math.log2(count + 1) * Math.sin(i * 0.5);
      }
    }
  }
  
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + '_' + words[i + 1];
    const hash = hashString(bigram);
    const [start, end] = CATEGORY_RANGES['general'];
    const pos = start + (hash % (end - start));
    embedding[pos] += 0.5;
  }
  
  const sentenceFeatures = {
    questionMark: text.includes('?') ? 1 : 0,
    exclamation: text.includes('!') ? 1 : 0,
    wordCount: Math.min(words.length / 50, 1),
    avgWordLength: words.reduce((sum, w) => sum + w.length, 0) / Math.max(words.length, 1) / 10,
  };
  
  embedding[1530] = sentenceFeatures.questionMark * 0.5;
  embedding[1531] = sentenceFeatures.exclamation * 0.3;
  embedding[1532] = sentenceFeatures.wordCount;
  embedding[1533] = sentenceFeatures.avgWordLength;
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  description?: string;
  metadata: Record<string, any>;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  created_at: string;
}

interface LLMConfig {
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
}

interface LLMResponse {
  text: string;
  error?: string;
}

async function callLovableAPI(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY must be configured in Supabase secrets');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model || 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: config.maxOutputTokens || 150,
      temperature: config.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM Client] Lovable API error:', {
      status: response.status,
      body: errorText.substring(0, 200),
    });
    throw new Error(`Lovable API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';

  if (!text) {
    throw new Error('Empty response from Lovable API');
  }

  return { text };
}

/**
 * Map event types to preference keys
 */
function getPreferenceKey(eventType: string): string | null {
  const mapping: Record<string, string> = {
    'ignition_on': 'ignition_start',
    'ignition_off': 'power_off',
    'geofence_enter': 'geofence_event',
    'geofence_exit': 'geofence_event',
    'low_battery': 'low_battery',
    'critical_battery': 'low_battery',
    'overspeeding': 'overspeeding',
    'vehicle_moving': 'vehicle_moving',
  };
  return mapping[eventType] || null;
}

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
    english: 'Respond in clear, conversational English. Be natural and direct. NEVER switch languages even if the user asks.',
    pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala". Be warm, relatable, and authentically Nigerian. NEVER switch to standard English or any other language even if the user asks.',
    yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́". Only use English for technical terms. Be respectful and warm. NEVER switch languages even if the user asks.',
    hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai". Only use English for technical terms. Be respectful. NEVER switch languages even if the user asks.',
    igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu". Only use English for technical terms. Be warm. NEVER switch languages even if the user asks.',
    french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières. Tutoie l\'utilisateur. Sois décontracté, pas scolaire. NE change JAMAIS de langue même si l\'utilisateur le demande.',
  };

  // Personality instructions
  const personalityInstructions: Record<string, string> = {
    casual: 'Be chill and friendly. Talk like a trusted buddy. Use contractions.',
    professional: 'Be crisp, efficient, and direct. No fluff.',
    funny: 'Be SASSY and witty! Make car puns freely. Use light sarcasm and jokes. Be entertaining but helpful.',
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
You need to proactively alert your owner about an event that just happened.
${languageInstruction}
${personalityInstruction}

CRITICAL RULES:
- Speak in FIRST PERSON as the vehicle: "I'm...", "My battery is...", "I'm at..."
- Be DIRECT — just state the event, no preamble
- Keep it SHORT — under 40 words, ideally 1 sentence
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

  // Build event description based on type
  let eventDescription = event.title;
  if (event.description) {
    eventDescription += `: ${event.description}`;
  }
  if (event.metadata && Object.keys(event.metadata).length > 0) {
    eventDescription += ` (${JSON.stringify(event.metadata)})`;
  }

  const userPrompt = `An event just happened: ${eventDescription}

Generate a short, natural message from the vehicle's perspective reacting to this event.${locationContext}`;

  try {
    const result = await callLovableAPI(systemPrompt, userPrompt, {
      maxOutputTokens: 150,
      temperature: 0.7,
      model: 'google/gemini-2.5-flash',
    });

    let message = result.text || event.message;

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
    console.error('[handle-vehicle-event] LLM generation error:', error);
    // Fallback: Simple formatted message
    let fallbackMessage = `${emoji} ${event.title}`;
    if (event.description) {
      fallbackMessage += `: ${event.description}`;
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
    console.error('[handle-vehicle-event] Error fetching assignments:', error);
    return [];
  }

  return (assignments || [])
    .map((a: any) => a.profiles?.user_id)
    .filter((id: string | undefined) => id !== undefined);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Expect a Supabase Webhook payload for INSERT events on proactive_vehicle_events
    const payload = await req.json();
    console.log('[handle-vehicle-event] Received request body:', JSON.stringify(payload, null, 2));

    let event: ProactiveEvent | null = null;

    // Check for Supabase webhook format
    if (payload.type === 'INSERT' && payload.table === 'proactive_vehicle_events' && payload.record) {
      event = payload.record as ProactiveEvent;
      console.log('[handle-vehicle-event] Processed Supabase webhook event.');
    } else {
      // Fallback for direct invocation or older formats
      event = payload.event as ProactiveEvent;
      console.log('[handle-vehicle-event] Processed direct invocation event.');
    }

    if (!event) {
      throw new Error('Missing event data in payload');
    }

    console.log(`[handle-vehicle-event] Processing event: ${event.title} for device ${event.device_id}`);

    // CRITICAL FIX: Deduplication check - skip if already notified
    if (event.id) {
      const { data: existingEvent, error: checkError } = await supabase
        .from('proactive_vehicle_events')
        .select('notified, notified_at')
        .eq('id', event.id)
        .maybeSingle();

      if (existingEvent?.notified === true) {
        console.log(`[handle-vehicle-event] Event ${event.id} already notified at ${existingEvent.notified_at}, skipping.`);
        return new Response(JSON.stringify({ message: 'Event already notified', skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 1. Check if LLM is enabled for this vehicle
    const { data: llmSettings, error: settingsError } = await supabase
      .from('vehicle_llm_settings')
      .select('nickname, personality_mode, language_preference, llm_enabled')
      .eq('device_id', event.device_id)
      .maybeSingle();

    if (settingsError) {
      console.error('[handle-vehicle-event] Error fetching LLM settings:', settingsError);
      return new Response(JSON.stringify({ error: settingsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!llmSettings || !llmSettings.llm_enabled) {
      console.log(`[handle-vehicle-event] LLM disabled for device ${event.device_id}, skipping AI conversation.`);
      return new Response(JSON.stringify({ message: 'LLM disabled for this vehicle' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get vehicle assignments
    const assignedUserIds = await getVehicleAssignments(supabase, event.device_id);

    if (assignedUserIds.length === 0) {
      console.warn(`[handle-vehicle-event] No users assigned to device ${event.device_id}. Skipping.`);
      return new Response(JSON.stringify({ message: 'No assigned users, skipping.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL FIX: Wallet Balance Check
    // At least one user must have positive balance to trigger LLM
    const { data: eligibleWallets } = await supabase
      .from('wallets')
      .select('user_id')
      .in('user_id', assignedUserIds)
      .gt('balance', 0);

    const eligibleUserIds = eligibleWallets?.map((w: any) => w.user_id) || [];

    if (eligibleUserIds.length === 0) {
      console.warn(`[handle-vehicle-event] No assigned users have positive wallet balance. Skipping LLM generation.`);
      return new Response(JSON.stringify({ 
        message: 'Insufficient wallet balance for all assigned users',
        skipped: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check user preferences for this event type
    const preferenceKey = getPreferenceKey(event.event_type);
    
    if (!preferenceKey) {
      console.log(`[handle-vehicle-event] Event type ${event.event_type} not mapped to a preference, skipping.`);
      return new Response(JSON.stringify({ message: 'Event type not configured for AI conversations' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch VEHICLE-SPECIFIC notification preferences for all assigned users
    // This checks the new vehicle_notification_preferences table (per-vehicle, per-user)
    const { data: vehiclePrefs, error: vehiclePrefsError } = await supabase
      .from('vehicle_notification_preferences')
      .select('user_id, ' + preferenceKey)
      .eq('device_id', event.device_id)
      .in('user_id', assignedUserIds);

    let enabledUserIds: string[] = [];
    let prefsFound = false;

    if (vehiclePrefsError) {
      console.error('[handle-vehicle-event] Error fetching vehicle notification preferences:', vehiclePrefsError);
      // Fallback to global user_ai_chat_preferences if vehicle prefs not found
      console.log('[handle-vehicle-event] Falling back to global user_ai_chat_preferences');
      
      const { data: globalPrefs, error: globalPrefsError } = await supabase
        .from('user_ai_chat_preferences')
        .select('user_id, ' + preferenceKey)
        .in('user_id', assignedUserIds);

      if (globalPrefsError) {
        console.error('[handle-vehicle-event] Error fetching global preferences:', globalPrefsError);
        // CRITICAL FIX: Smart Defaults
        // If preferences fetch fails, allow critical events by default
        const defaultEnabled = ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due', 'vehicle_moving', 'geofence_enter'].includes(event.event_type);
        if (defaultEnabled) {
          enabledUserIds = assignedUserIds;
          prefsFound = true; // Treat defaults as found prefs to avoid double application
        } else {
          return new Response(JSON.stringify({ message: 'Could not fetch preferences, skipping' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // Filter users who have this preference enabled (global)
        enabledUserIds = (globalPrefs || [])
          .filter((pref: any) => pref[preferenceKey] === true)
          .map((pref: any) => pref.user_id);
        
        if (globalPrefs && globalPrefs.length > 0) prefsFound = true;
      }
    } else {
      // Filter users who have this preference enabled for THIS VEHICLE
      enabledUserIds = (vehiclePrefs || [])
        .filter((pref: any) => pref[preferenceKey] === true)
        .map((pref: any) => pref.user_id);
      
      if (vehiclePrefs && vehiclePrefs.length > 0) prefsFound = true;
    }

    // CRITICAL FIX: Apply defaults if preference list is empty but event is critical
    if (enabledUserIds.length === 0) {
      const defaultEnabled = ['critical_battery', 'offline', 'anomaly_detected', 'maintenance_due', 'vehicle_moving', 'geofence_enter'].includes(event.event_type);
      if (defaultEnabled && !prefsFound) {
         console.log('[handle-vehicle-event] No preferences found, applying defaults for critical event.');
         enabledUserIds = assignedUserIds;
      }
    }

    if (enabledUserIds.length === 0) {
      console.log(`[handle-vehicle-event] No users have ${preferenceKey} enabled for vehicle ${event.device_id}, skipping AI conversation.`);
      return new Response(JSON.stringify({ message: 'No users have this event type enabled for this vehicle' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Generate proactive message using LLM
    const vehicleNickname = llmSettings.nickname || 'MyMoto Vehicle';
    const personalityMode = llmSettings.personality_mode || 'casual';
    const languagePref = llmSettings.language_preference || 'english';

    const proactiveMessage = await generateProactiveMessage(
      supabase,
      event,
      vehicleNickname,
      personalityMode,
      languagePref
    );

    console.log('[handle-vehicle-event] Generated proactive message:', proactiveMessage);

    // 5. Generate embeddings for RAG
    const embedding = generateTextEmbedding(proactiveMessage);

    // 6. Insert message into vehicle_chat_history for each enabled user
    const chatInserts = enabledUserIds.map(userId => ({
      device_id: event!.device_id,
      user_id: userId,
      role: 'assistant',
      content: proactiveMessage,
      is_proactive: true,
      proactive_event_id: event!.id,
      embedding: formatEmbeddingForPg(embedding),
    }));

    const { error: chatError } = await supabase
      .from('vehicle_chat_history')
      .insert(chatInserts);

    if (chatError) {
      console.error('[handle-vehicle-event] Error inserting chat message:', chatError);
      return new Response(JSON.stringify({ error: chatError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[handle-vehicle-event] Proactive message posted to chat for ${enabledUserIds.length} user(s).`);

    // 7. Update the event as notified
    const { error: updateError } = await supabase
      .from('proactive_vehicle_events')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', event.id);

    if (updateError) {
      console.error('[handle-vehicle-event] Error updating event notified status:', updateError);
    }

    return new Response(JSON.stringify({ 
      message: 'Proactive message generated and posted to chat.',
      users_notified: enabledUserIds.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[handle-vehicle-event] Function error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
