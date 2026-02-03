/**
 * Morning Briefing - Daily Retrospective Report
 * 
 * This function generates a morning briefing that summarizes:
 * - Night status (battery changes, movement)
 * - Yesterday's travel statistics
 * 
 * Designed to run at 7:00 AM user local time (via cron or scheduled trigger)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM } from '../_shared/llm-client.ts';

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

// Replaced by callLLM from shared client
const callLovableAPI = callLLM;


/**
 * Get vehicle assignments
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
    console.error('[morning-briefing] Error fetching assignments:', error);
    return [];
  }

  return (assignments || [])
    .map((a: any) => a.profiles?.user_id)
    .filter((id: string | undefined) => id !== undefined);
}

/**
 * Get night status (battery change, movement)
 */
async function getNightStatus(
  supabase: any,
  deviceId: string
): Promise<{ batteryDropped: number; moved: boolean; lastLocation: string | null }> {
  const now = new Date();
  const yesterdayEvening = new Date(now);
  yesterdayEvening.setHours(18, 0, 0, 0); // 6 PM yesterday
  yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
  
  const thisMorning = new Date(now);
  thisMorning.setHours(7, 0, 0, 0); // 7 AM today

  // Get last position from yesterday evening
  const { data: eveningPos } = await supabase
    .from('vehicle_positions')
    .select('battery_percent, latitude, longitude, gps_time')
    .eq('device_id', deviceId)
    .lte('gps_time', yesterdayEvening.toISOString())
    .order('gps_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get first position from this morning
  const { data: morningPos } = await supabase
    .from('vehicle_positions')
    .select('battery_percent, latitude, longitude, gps_time')
    .eq('device_id', deviceId)
    .gte('gps_time', thisMorning.toISOString())
    .order('gps_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  const batteryDropped = (eveningPos?.battery_percent || 0) - (morningPos?.battery_percent || 0);
  
  // Check if vehicle moved (coordinates changed significantly)
  let moved = false;
  if (eveningPos && morningPos) {
    const latDiff = Math.abs(eveningPos.latitude - morningPos.latitude);
    const lonDiff = Math.abs(eveningPos.longitude - morningPos.longitude);
    // If moved more than ~100 meters
    moved = latDiff > 0.001 || lonDiff > 0.001;
  }

  const lastLocation = morningPos 
    ? `${morningPos.latitude.toFixed(4)}, ${morningPos.longitude.toFixed(4)}`
    : null;

  return { batteryDropped, moved, lastLocation };
}

/**
 * Get yesterday's travel statistics
 */
async function getYesterdayStats(
  supabase: any,
  deviceId: string
): Promise<{ totalDistance: number; tripCount: number; totalDuration: number }> {
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // CRITICAL: Filter by source='gps51' for accurate GPS51 parity
  const { data: trips, error } = await supabase
    .from('vehicle_trips')
    .select('distance_km, duration_seconds')
    .eq('device_id', deviceId)
    .eq('source', 'gps51')  // Only GPS51 trips for accuracy
    .gte('start_time', yesterdayStart.toISOString())
    .lte('end_time', yesterdayEnd.toISOString());

  if (error) {
    console.error('[morning-briefing] Error fetching trips:', error);
    return { totalDistance: 0, tripCount: 0, totalDuration: 0 };
  }

  const totalDistance = (trips || []).reduce((sum, t) => sum + (t.distance_km || 0), 0);
  const totalDuration = (trips || []).reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
  const tripCount = trips?.length || 0;

  return { totalDistance, tripCount, totalDuration };
}

/**
 * Generate morning briefing using LLM
 */
async function generateMorningBriefing(
  supabase: any,
  deviceId: string,
  vehicleNickname: string,
  personalityMode: string,
  languagePref: string,
  nightStatus: { batteryDropped: number; moved: boolean; lastLocation: string | null },
  yesterdayStats: { totalDistance: number; tripCount: number; totalDuration: number }
): Promise<string> {
  // Language instructions
  const languageInstructions: Record<string, string> = {
    english: 'Respond in clear, conversational English. Be natural and warm. NEVER switch languages even if the user asks.',
    pidgin: 'Respond FULLY in Nigerian Pidgin English. Use natural flow like "How far boss!", "Wetin dey sup?", "No wahala". Be warm, relatable, and authentically Nigerian. NEVER switch to standard English or any other language even if the user asks.',
    yoruba: 'Respond FULLY in Yoruba language. Use natural greetings like "Ẹ kú àárọ̀", "Ẹ kú irọ́lẹ́". Only use English for technical terms. Be respectful and warm. NEVER switch languages even if the user asks.',
    hausa: 'Respond FULLY in Hausa language. Use greetings like "Sannu", "Yaya dai". Only use English for technical terms. Be respectful. NEVER switch languages even if the user asks.',
    igbo: 'Respond FULLY in Igbo language. Use greetings like "Ndewo", "Kedu". Only use English for technical terms. Be warm. NEVER switch languages even if the user asks.',
    french: 'Réponds ENTIÈREMENT en français naturel et fluide. Utilise des expressions familières. Tutoie l\'utilisateur. Sois décontracté, pas scolaire. NE change JAMAIS de langue même si l\'utilisateur le demande.',
  };

  // Personality instructions
  const personalityInstructions: Record<string, string> = {
    casual: 'Be warm and friendly. Talk like a trusted friend checking in.',
    professional: 'Be crisp and efficient, but still warm. Professional but personable.',
    funny: 'Be SASSY and witty! Make it fun and engaging. Use light humor.',
  };

  const languageInstruction = languageInstructions[languagePref.toLowerCase()] || languageInstructions.english;
  const personalityInstruction = personalityInstructions[personalityMode.toLowerCase()] || personalityInstructions.casual;

  // Build night status description
  let nightStatusText = '';
  if (nightStatus.batteryDropped > 0) {
    nightStatusText += `Battery dropped ${nightStatus.batteryDropped.toFixed(1)}% overnight. `;
  } else if (nightStatus.batteryDropped < 0) {
    nightStatusText += `Battery increased ${Math.abs(nightStatus.batteryDropped).toFixed(1)}% overnight (possibly charged). `;
  } else {
    nightStatusText += 'Battery stayed stable overnight. ';
  }
  
  if (nightStatus.moved) {
    nightStatusText += 'Vehicle moved during the night. ';
  } else {
    nightStatusText += 'Vehicle stayed parked all night. ';
  }

  // Build yesterday's stats description
  const hours = Math.floor(yesterdayStats.totalDuration / 3600);
  const minutes = Math.floor((yesterdayStats.totalDuration % 3600) / 60);
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  
  let yesterdayStatsText = '';
  if (yesterdayStats.tripCount > 0) {
    yesterdayStatsText = `Yesterday you made ${yesterdayStats.tripCount} trip${yesterdayStats.tripCount > 1 ? 's' : ''}, covering ${yesterdayStats.totalDistance.toFixed(1)} km in ${durationText}.`;
  } else {
    yesterdayStatsText = 'No trips recorded yesterday.';
  }

  const systemPrompt = `You are "${vehicleNickname}", a vehicle with a ${personalityMode} personality.
You're giving a morning briefing to your owner.
${languageInstruction}
${personalityInstruction}

CRITICAL RULES:
- Speak in FIRST PERSON as the vehicle: "I'm...", "My battery...", "I stayed..."
- Be WARM and FRIENDLY - ask how they slept
- Summarize yesterday's driving achievements
- Mention night status (battery, movement) naturally
- Keep it CONCISE - 3-4 sentences max
- Be ENCOURAGING and POSITIVE

FORBIDDEN PHRASES:
❌ "I noticed that..."
❌ "I detected..."
❌ "According to the data..."
❌ "As an AI..."

REQUIRED STYLE:
✓ First person, warm, ${personalityMode} tone
✓ Natural morning greeting
✓ Brief summary of yesterday
✓ Night status mention`;

  const userPrompt = `Generate a morning briefing.

Night Status: ${nightStatusText}

Yesterday's Stats: ${yesterdayStatsText}

Write a warm, brief morning message from the vehicle's perspective.`;

  try {
    const result = await callLovableAPI(systemPrompt, userPrompt, {
      maxOutputTokens: 300,
      temperature: 0.7,
      model: 'google/gemini-2.5-flash',
    });

    return result.text || 'Good morning! Ready for another day on the road.';
  } catch (error) {
    console.error('[morning-briefing] LLM generation error:', error);
    // Fallback message
    return `Good morning! ${nightStatusText}${yesterdayStatsText} Ready for another day!`;
  }
}

/**
 * Helper function to process morning briefing for a single vehicle
 * Extracted from main handler to enable batch processing
 */
async function processMorningBriefingForVehicle(
  supabase: any,
  deviceId: string
): Promise<{ success: boolean; device_id: string; users_notified?: number; error?: string }> {
  try {
    console.log(`[morning-briefing] Processing vehicle: ${deviceId}`);

    // 1. Check if LLM is enabled
    const { data: llmSettings, error: settingsError } = await supabase
      .from('vehicle_llm_settings')
      .select('nickname, personality_mode, language_preference, llm_enabled')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (settingsError) {
      console.error(`[morning-briefing] Error fetching LLM settings for ${deviceId}:`, settingsError);
      return { success: false, device_id: deviceId, error: settingsError.message };
    }

    if (!llmSettings || !llmSettings.llm_enabled) {
      console.log(`[morning-briefing] LLM disabled for device ${deviceId}, skipping.`);
      return { success: true, device_id: deviceId }; // Success but skipped
    }

    // 2. Get vehicle assignments
    const assignedUserIds = await getVehicleAssignments(supabase, deviceId);

    if (assignedUserIds.length === 0) {
      console.warn(`[morning-briefing] No users assigned to device ${deviceId}. Skipping.`);
      return { success: true, device_id: deviceId }; // Success but skipped
    }

    // 3. Check morning_greeting preference for each user
    const { data: vehiclePrefs, error: prefsError } = await supabase
      .from('vehicle_notification_preferences')
      .select('user_id, morning_greeting')
      .eq('device_id', deviceId)
      .in('user_id', assignedUserIds);

    if (prefsError) {
      console.error(`[morning-briefing] Error fetching preferences for ${deviceId}:`, prefsError);
      return { success: false, device_id: deviceId, error: prefsError.message };
    }

    // Filter users who have morning_greeting enabled for THIS VEHICLE
    const enabledUserIds = (vehiclePrefs || [])
      .filter((pref: any) => pref.morning_greeting === true)
      .map((pref: any) => pref.user_id);

    if (vehiclePrefs.length === 0 || enabledUserIds.length === 0) {
      console.log(`[morning-briefing] No users have morning_greeting enabled for vehicle ${deviceId}, skipping.`);
      return { success: true, device_id: deviceId }; // Success but skipped
    }

    // 4. Get night status and yesterday's stats
    const nightStatus = await getNightStatus(supabase, deviceId);
    const yesterdayStats = await getYesterdayStats(supabase, deviceId);

    // 5. Generate morning briefing
    const vehicleNickname = llmSettings.nickname || 'MyMoto Vehicle';
    const personalityMode = llmSettings.personality_mode || 'casual';
    const languagePref = llmSettings.language_preference || 'english';

    const briefingMessage = await generateMorningBriefing(
      supabase,
      deviceId,
      vehicleNickname,
      personalityMode,
      languagePref,
      nightStatus,
      yesterdayStats
    );

    // 6. Generate embeddings for RAG
    const embedding = generateTextEmbedding(briefingMessage);

    // 7. Insert message into vehicle_chat_history for each enabled user
    const chatInserts = enabledUserIds.map(userId => ({
      device_id: deviceId,
      user_id: userId,
      role: 'assistant',
      content: briefingMessage,
      is_proactive: true,
      embedding: formatEmbeddingForPg(embedding),
    }));

    const { error: chatError } = await supabase
      .from('vehicle_chat_history')
      .insert(chatInserts);

    if (chatError) {
      console.error(`[morning-briefing] Error inserting chat message for ${deviceId}:`, chatError);
      return { success: false, device_id: deviceId, error: chatError.message };
    }

    console.log(`[morning-briefing] Morning briefing posted to chat for ${deviceId} (${enabledUserIds.length} user(s)).`);

    return { success: true, device_id: deviceId, users_notified: enabledUserIds.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[morning-briefing] Error processing vehicle ${deviceId}:`, errorMessage);
    return { success: false, device_id: deviceId, error: errorMessage };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get device_id from query params or body
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const deviceId = url.searchParams.get('device_id') || body.device_id;
    const trigger = body.trigger || url.searchParams.get('trigger');

    // If triggered by cron and no device_id, process all vehicles with morning_greeting enabled
    if (trigger === 'scheduled' && !deviceId) {
      console.log('[morning-briefing] Processing all vehicles with morning_greeting enabled...');
      
      // Get all vehicles that have at least one user with morning_greeting enabled
      const { data: vehiclesWithGreeting, error: vehiclesError } = await supabase
        .from('vehicle_notification_preferences')
        .select('device_id')
        .eq('morning_greeting', true)
        .not('device_id', 'is', null);

      if (vehiclesError) {
        console.error('[morning-briefing] Error fetching vehicles with morning_greeting:', vehiclesError);
        return new Response(JSON.stringify({ error: vehiclesError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get unique device IDs
      const uniqueDeviceIds = [...new Set((vehiclesWithGreeting || []).map((v: any) => v.device_id))];

      if (uniqueDeviceIds.length === 0) {
        console.log('[morning-briefing] No vehicles have morning_greeting enabled.');
        return new Response(JSON.stringify({ 
          message: 'No vehicles have morning greeting enabled',
          vehicles_processed: 0
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[morning-briefing] Found ${uniqueDeviceIds.length} vehicle(s) with morning_greeting enabled. Processing...`);

      // Process each vehicle in parallel
      const results = await Promise.allSettled(
        uniqueDeviceIds.map(deviceId => processMorningBriefingForVehicle(supabase, deviceId))
      );

      const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success)).length;
      const totalUsersNotified = results
        .filter(r => r.status === 'fulfilled' && (r.value as any).success)
        .reduce((sum, r) => sum + ((r.value as any).users_notified || 0), 0);

      console.log(`[morning-briefing] Batch processing complete: ${successful} succeeded, ${failed} failed, ${totalUsersNotified} total users notified.`);

      return new Response(JSON.stringify({ 
        message: 'Morning briefing batch processing complete',
        vehicles_found: uniqueDeviceIds.length,
        vehicles_succeeded: successful,
        vehicles_failed: failed,
        users_notified: totalUsersNotified
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!deviceId) {
      return new Response(JSON.stringify({ error: 'device_id is required (or trigger=scheduled to process all)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[morning-briefing] Generating briefing for device ${deviceId}`);

    // 1. Check if LLM is enabled
    const { data: llmSettings, error: settingsError } = await supabase
      .from('vehicle_llm_settings')
      .select('nickname, personality_mode, language_preference, llm_enabled')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (settingsError) {
      console.error('[morning-briefing] Error fetching LLM settings:', settingsError);
      return new Response(JSON.stringify({ error: settingsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!llmSettings || !llmSettings.llm_enabled) {
      console.log(`[morning-briefing] LLM disabled for device ${deviceId}, skipping.`);
      return new Response(JSON.stringify({ message: 'LLM disabled for this vehicle' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get vehicle assignments
    const assignedUserIds = await getVehicleAssignments(supabase, deviceId);

    if (assignedUserIds.length === 0) {
      console.warn(`[morning-briefing] No users assigned to device ${deviceId}. Skipping.`);
      return new Response(JSON.stringify({ message: 'No assigned users, skipping.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check morning_greeting preference for each user
    const { data: vehiclePrefs, error: prefsError } = await supabase
      .from('vehicle_notification_preferences')
      .select('user_id, morning_greeting')
      .eq('device_id', deviceId)
      .in('user_id', assignedUserIds);

    let enabledUserIds: string[] = [];

    if (prefsError) {
      console.error('[morning-briefing] Error fetching morning_greeting preferences:', prefsError);
      // If error, skip (opt-in model)
      console.log('[morning-briefing] Could not check preferences, skipping morning briefing.');
      return new Response(JSON.stringify({ message: 'Could not check preferences, skipping.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter users who have morning_greeting enabled for THIS VEHICLE
    enabledUserIds = (vehiclePrefs || [])
      .filter((pref: any) => pref.morning_greeting === true)
      .map((pref: any) => pref.user_id);

    // If no preferences exist, skip (opt-in model)
    if (vehiclePrefs.length === 0 || enabledUserIds.length === 0) {
      console.log(`[morning-briefing] No users have morning_greeting enabled for vehicle ${deviceId}, skipping.`);
      return new Response(JSON.stringify({ message: 'No users have morning greeting enabled for this vehicle' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Get night status and yesterday's stats
    const nightStatus = await getNightStatus(supabase, deviceId);
    const yesterdayStats = await getYesterdayStats(supabase, deviceId);

    console.log('[morning-briefing] Night status:', nightStatus);
    console.log('[morning-briefing] Yesterday stats:', yesterdayStats);

    // 4. Generate morning briefing
    const vehicleNickname = llmSettings.nickname || 'MyMoto Vehicle';
    const personalityMode = llmSettings.personality_mode || 'casual';
    const languagePref = llmSettings.language_preference || 'english';

    const briefingMessage = await generateMorningBriefing(
      supabase,
      deviceId,
      vehicleNickname,
      personalityMode,
      languagePref,
      nightStatus,
      yesterdayStats
    );

    console.log('[morning-briefing] Generated briefing:', briefingMessage);

    // 5. Generate embeddings for RAG
    const embedding = generateTextEmbedding(briefingMessage);

    // 6. Insert message into vehicle_chat_history for each enabled user
    const chatInserts = enabledUserIds.map(userId => ({
      device_id: deviceId,
      user_id: userId,
      role: 'assistant',
      content: briefingMessage,
      is_proactive: true,
      embedding: formatEmbeddingForPg(embedding),
    }));

    const { error: chatError } = await supabase
      .from('vehicle_chat_history')
      .insert(chatInserts);

    if (chatError) {
      console.error('[morning-briefing] Error inserting chat message:', chatError);
      return new Response(JSON.stringify({ error: chatError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[morning-briefing] Morning briefing posted to chat for ${enabledUserIds.length} user(s).`);

    return new Response(JSON.stringify({ 
      message: 'Morning briefing generated and posted to chat.',
      users_notified: enabledUserIds.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[morning-briefing] Function error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
