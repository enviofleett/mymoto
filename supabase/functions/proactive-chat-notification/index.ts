import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TriggerPayload {
  device_id: string;
  trigger_type: 'low_battery' | 'overspeed' | 'geofence';
  data: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: TriggerPayload = await req.json();
    console.log(`[Proactive] Received trigger: ${payload.trigger_type} for ${payload.device_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get Owner of the Device
    // We need to know WHO to message.
    // Query `vehicle_assignments` (or `vehicles.profile_id` if direct ownership)
    const { data: assignments, error: ownerError } = await supabase
      .from('vehicle_assignments')
      .select('profile_id')
      .eq('device_id', payload.device_id)
      .eq('status', 'active') // Only active owners
      .limit(1);

    if (ownerError || !assignments || assignments.length === 0) {
      console.warn(`[Proactive] No active owner found for device ${payload.device_id}. Aborting.`);
      return new Response(JSON.stringify({ error: "No owner found" }), { status: 404, headers: corsHeaders });
    }

    // Notify ALL active owners (usually just one)
    for (const assignment of assignments) {
      const userId = assignment.profile_id;

      // 2. Check User Preferences (Optional but recommended)
      // TODO: Check `user_preferences` table if they enabled 'battery_alerts'

      // 3. Generate Message based on Trigger
      let message = "";
      if (payload.trigger_type === 'low_battery') {
        const percent = payload.data.battery_percent;
        message = `I noticed your battery is critical (${percent}%). Should I switch to power-saving mode?`;
      } else {
        message = `Alert: ${payload.trigger_type} detected.`;
      }

      // 4. Insert into Chat History (This pushes to the UI via Realtime)
      const { error: chatError } = await supabase
        .from('vehicle_chat_history')
        .insert({
          device_id: payload.device_id,
          user_id: userId,
          role: 'assistant', // It appears as the Agent speaking
          content: message,
          metadata: {
            is_proactive: true,
            trigger_type: payload.trigger_type,
            trigger_data: payload.data
          }
        });

      if (chatError) {
        console.error(`[Proactive] Failed to push chat message:`, chatError);
      } else {
        console.log(`[Proactive] Message sent to user ${userId}`);
      }
      
      // 5. Send Push Notification (Optional - via OneSignal or Expo)
      // await sendPushNotification(userId, message);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Proactive] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
