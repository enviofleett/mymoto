/**
 * FIX: Morning Briefing Batch Processing
 * 
 * This fixes the incomplete batch processing logic in morning-briefing/index.ts
 * The function currently returns device_ids instead of processing them.
 * 
 * Apply this fix to: supabase/functions/morning-briefing/index.ts
 * Replace lines 457-504 with the code below.
 */

// EXISTING CODE (lines 440-456) - Keep this as is
// ... existing code ...

// REPLACE LINES 457-504 WITH THIS:

// Helper function to process morning briefing for a single vehicle
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

// REPLACE THE EXISTING BLOCK (lines 457-504) WITH THIS:
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

  // Process each vehicle
  const results = await Promise.allSettled(
    uniqueDeviceIds.map(deviceId => processMorningBriefingForVehicle(supabase, deviceId))
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  const totalUsersNotified = results
    .filter(r => r.status === 'fulfilled' && r.value.success)
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
