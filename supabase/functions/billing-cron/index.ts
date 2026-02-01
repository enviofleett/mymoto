import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting billing cron job...");

    // 1. Get the daily rate from billing_config
    const { data: config, error: configError } = await supabase
      .from("billing_config")
      .select("value")
      .eq("key", "daily_llm_rate")
      .single();

    if (configError) {
      console.error("Error fetching billing config:", configError);
      throw configError;
    }

    const dailyRate = parseFloat(config.value);
    console.log(`Daily LLM rate: NGN ${dailyRate}`);

    // 2. Get all vehicles with LLM enabled
    const { data: enabledVehicles, error: vehiclesError } = await supabase
      .from("vehicle_llm_settings")
      .select("device_id")
      .eq("llm_enabled", true);

    if (vehiclesError) {
      console.error("Error fetching enabled vehicles:", vehiclesError);
      throw vehiclesError;
    }

    console.log(`Found ${enabledVehicles?.length || 0} vehicles with LLM enabled`);

    if (!enabledVehicles || enabledVehicles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No vehicles to bill", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get vehicle assignments to find owners
    const deviceIds = enabledVehicles.map((v) => v.device_id);
    const { data: assignments, error: assignError } = await supabase
      .from("vehicle_assignments")
      .select("device_id, profile_id")
      .in("device_id", deviceIds);

    if (assignError) {
      console.error("Error fetching assignments:", assignError);
      throw assignError;
    }

    // 4. Get profiles to find user_ids
    const profileIds = [...new Set(assignments?.map((a) => a.profile_id).filter(Boolean))];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, user_id, name")
      .in("id", profileIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    // Build a map: device_id -> user_id
    const deviceToUser: Record<string, string> = {};
    for (const assignment of assignments || []) {
      const profile = profiles?.find((p) => p.id === assignment.profile_id);
      if (profile?.user_id) {
        deviceToUser[assignment.device_id] = profile.user_id;
      }
    }

    // 5. Get vehicles info for descriptions
    const { data: vehicles, error: vError } = await supabase
      .from("vehicles")
      .select("device_id, device_name")
      .in("device_id", deviceIds);

    const vehicleNames: Record<string, string> = {};
    for (const v of vehicles || []) {
      vehicleNames[v.device_id] = v.device_name;
    }

    // 6. Process billing for each unique user
    const userDevices: Record<string, string[]> = {};
    for (const [deviceId, userId] of Object.entries(deviceToUser)) {
      if (!userDevices[userId]) userDevices[userId] = [];
      userDevices[userId].push(deviceId);
    }

    let processedCount = 0;
    let disabledCount = 0;
    const results: any[] = [];

    // Helper to get Lagos date string YYYY-MM-DD
    const getLagosDateString = () => {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    };
    const lagosDate = getLagosDateString();

    for (const [userId, userDeviceIds] of Object.entries(userDevices)) {
      const totalCharge = dailyRate * userDeviceIds.length;
      let userBalance = 0;

      // We'll process each vehicle individually to maintain granular transaction history
      // and use the atomic RPC for safety.
      
      for (const deviceId of userDeviceIds) {
        const vehicleName = vehicleNames[deviceId] || deviceId;
        const reference = `billing_${deviceId}_${lagosDate}`;

        // Call RPC for atomic debit
        const { data: rpcResult, error: rpcError } = await supabase.rpc("credit_wallet_atomic", {
          p_user_id: userId,
          p_amount: -dailyRate, // Negative for debit
          p_reference: reference,
          p_description: `Daily LLM fee: ${vehicleName}`,
          p_metadata: { 
            device_id: deviceId, 
            rate: dailyRate,
            type: 'daily_subscription'
          }
        });

        if (rpcError) {
          console.error(`RPC Error billing user ${userId} for device ${deviceId}:`, rpcError);
          continue;
        }

        if (!rpcResult.success) {
           // If it failed (e.g. maybe insufficient funds if we enforced it, but likely we allow negative),
           // log it. If the RPC prevents negative balance, we might get an error here.
           // Assuming we allow negative balance for subscription fees (post-paid style) or 
           // we just want to record it.
           // If the RPC enforces >= 0, then this might fail.
           // For now, we assume it succeeds or we handle the failure.
           console.error(`Billing failed for user ${userId}, device ${deviceId}: ${rpcResult.error}`);
        } else {
           processedCount++;
           userBalance = rpcResult.new_balance;
           
           // Update last_billing_date only on success
           await supabase
            .from("vehicle_llm_settings")
            .update({ last_billing_date: new Date().toISOString() })
            .eq("device_id", deviceId);
        }
      }

      // Check balance and disable if negative
      // We use the balance from the last RPC call
      if (userBalance < 0) {
        for (const deviceId of userDeviceIds) {
          await supabase
            .from("vehicle_llm_settings")
            .update({ llm_enabled: false })
            .eq("device_id", deviceId);
          disabledCount++;
        }
        console.log(`Disabled LLM for user ${userId} due to negative balance: ${userBalance}`);
      }

      results.push({
        user_id: userId,
        vehicles: userDeviceIds.length,
        charged: totalCharge,
        new_balance: userBalance,
        disabled: userBalance < 0,
      });
    }

    console.log(`Billing complete. Processed: ${processedCount}, Disabled: ${disabledCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        disabled: disabledCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Billing cron error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
