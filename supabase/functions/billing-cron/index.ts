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

    for (const [userId, userDeviceIds] of Object.entries(userDevices)) {
      const totalCharge = dailyRate * userDeviceIds.length;

      // Get user's wallet
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", userId)
        .single();

      if (walletError || !wallet) {
        console.log(`No wallet found for user ${userId}, skipping...`);
        continue;
      }

      const newBalance = parseFloat(wallet.balance) - totalCharge;

      // Debit the wallet
      const { error: updateError } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", wallet.id);

      if (updateError) {
        console.error(`Error updating wallet for user ${userId}:`, updateError);
        continue;
      }

      // Record transactions for each vehicle
      for (const deviceId of userDeviceIds) {
        const vehicleName = vehicleNames[deviceId] || deviceId;
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          amount: -dailyRate,
          type: "debit",
          description: `Daily LLM fee: ${vehicleName}`,
          reference: `billing_${deviceId}_${new Date().toISOString().split("T")[0]}`,
          metadata: { device_id: deviceId, rate: dailyRate },
        });

        // Update last_billing_date
        await supabase
          .from("vehicle_llm_settings")
          .update({ last_billing_date: new Date().toISOString() })
          .eq("device_id", deviceId);

        processedCount++;
      }

      // If balance is negative, disable LLM for this user's vehicles
      if (newBalance < 0) {
        for (const deviceId of userDeviceIds) {
          await supabase
            .from("vehicle_llm_settings")
            .update({ llm_enabled: false })
            .eq("device_id", deviceId);
          disabledCount++;
        }
        console.log(`Disabled LLM for user ${userId} due to insufficient balance`);
      }

      results.push({
        user_id: userId,
        vehicles: userDeviceIds.length,
        charged: totalCharge,
        new_balance: newBalance,
        disabled: newBalance < 0,
      });
    }

    // ============================================
    // NEW: Process ad campaign billing
    // ============================================
    console.log("Processing ad campaign billing...");

    // Get all active ad campaigns
    const { data: activeCampaigns, error: campaignsError } = await supabase
      .from("ad_campaigns")
      .select(`
        id,
        provider_id,
        daily_budget,
        service_providers!inner (
          profile_id
        )
      `)
      .eq("is_active", true);

    if (campaignsError) {
      console.error("Error fetching ad campaigns:", campaignsError);
    } else if (activeCampaigns && activeCampaigns.length > 0) {
      let adProcessedCount = 0;
      let adDisabledCount = 0;

      for (const campaign of activeCampaigns) {
        const provider = campaign.service_providers;
        if (!provider) continue;

        // Get provider's profile to find user_id
        const { data: providerProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", provider.profile_id)
          .single();

        if (!providerProfile || !providerProfile.user_id) {
          console.log(`No user_id found for provider ${campaign.provider_id}`);
          continue;
        }

        // Get provider's wallet
        const { data: providerWallet, error: walletError } = await supabase
          .from("wallets")
          .select("id, balance")
          .eq("user_id", providerProfile.user_id)
          .single();

        if (walletError || !providerWallet) {
          console.log(`No wallet found for provider ${campaign.provider_id}, disabling campaign`);
          await supabase
            .from("ad_campaigns")
            .update({ is_active: false })
            .eq("id", campaign.id);
          adDisabledCount++;
          continue;
        }

        const currentBalance = parseFloat(providerWallet.balance);
        const dailyBudget = parseFloat(campaign.daily_budget);

        // Check if sufficient balance
        if (currentBalance < dailyBudget) {
          console.log(
            `Insufficient balance for campaign ${campaign.id}. Balance: ${currentBalance}, Required: ${dailyBudget}`
          );
          await supabase.from("ad_campaigns").update({ is_active: false }).eq("id", campaign.id);
          adDisabledCount++;
          continue;
        }

        // Deduct daily budget
        const newBalance = currentBalance - dailyBudget;
        const { error: updateError } = await supabase
          .from("wallets")
          .update({ balance: newBalance })
          .eq("id", providerWallet.id);

        if (updateError) {
          console.error(`Error updating wallet for campaign ${campaign.id}:`, updateError);
          continue;
        }

        // Record transaction
        await supabase.from("wallet_transactions").insert({
          wallet_id: providerWallet.id,
          amount: -dailyBudget,
          type: "debit",
          description: `Daily ad campaign: Campaign ${campaign.id}`,
          reference: `ad_campaign_${campaign.id}_${new Date().toISOString().split("T")[0]}`,
          metadata: { campaign_id: campaign.id, daily_budget: dailyBudget },
        });

        // Update campaign statistics
        const { data: currentCampaign } = await supabase
          .from("ad_campaigns")
          .select("total_spent")
          .eq("id", campaign.id)
          .single();

        if (currentCampaign) {
          await supabase
            .from("ad_campaigns")
            .update({
              total_spent: (parseFloat(currentCampaign.total_spent || 0) + dailyBudget).toFixed(2),
              updated_at: new Date().toISOString(),
            })
            .eq("id", campaign.id);
        }

        adProcessedCount++;
      }

      console.log(`Ad billing complete. Processed: ${adProcessedCount}, Disabled: ${adDisabledCount}`);
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
