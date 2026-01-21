import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VehicleLocation {
  device_id: string;
  latitude: number;
  longitude: number;
  user_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[match-ads] Starting ad matching process...");

    // 1. Get all active ad campaigns
    const { data: activeCampaigns, error: campaignsError } = await supabase
      .from("ad_campaigns")
      .select(`
        id,
        provider_id,
        title,
        description,
        target_radius_km,
        start_date,
        end_date,
        service_providers!inner (
          id,
          business_name,
          latitude,
          longitude,
          location
        )
      `)
      .eq("is_active", true)
      .gte("start_date", new Date().toISOString())
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`);

    if (campaignsError) {
      console.error("[match-ads] Error fetching campaigns:", campaignsError);
      throw campaignsError;
    }

    if (!activeCampaigns || activeCampaigns.length === 0) {
      console.log("[match-ads] No active campaigns found");
      return new Response(
        JSON.stringify({ success: true, message: "No active campaigns", matched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[match-ads] Found ${activeCampaigns.length} active campaigns`);

    // 2. Get all vehicles with recent positions (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: vehiclePositions, error: positionsError } = await supabase
      .from("vehicle_positions")
      .select("device_id, latitude, longitude, gps_time")
      .gte("gps_time", oneHourAgo)
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (positionsError) {
      console.error("[match-ads] Error fetching vehicle positions:", positionsError);
      throw positionsError;
    }

    if (!vehiclePositions || vehiclePositions.length === 0) {
      console.log("[match-ads] No vehicles with recent positions");
      return new Response(
        JSON.stringify({ success: true, message: "No vehicles with recent positions", matched: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[match-ads] Found ${vehiclePositions.length} vehicles with recent positions`);

    // 3. Group campaigns by location cluster (to avoid spam)
    const locationClusters = new Map<string, any[]>();

    for (const campaign of activeCampaigns) {
      const provider = campaign.service_providers;
      if (!provider || !provider.location) continue;

      const clusterKey = `${Math.round(provider.latitude * 10) / 10}_${Math.round(provider.longitude * 10) / 10}`;
      
      if (!locationClusters.has(clusterKey)) {
        locationClusters.set(clusterKey, []);
      }
      locationClusters.get(clusterKey)!.push(campaign);
    }

    let totalMatched = 0;
    let totalMessagesSent = 0;

    // 4. For each vehicle, check if it's within range of any campaign cluster
    for (const vehicle of vehiclePositions) {
      if (!vehicle.latitude || !vehicle.longitude) continue;

      const nearbyDeals: any[] = [];

      // Check each campaign cluster
      for (const [clusterKey, campaigns] of locationClusters.entries()) {
        for (const campaign of campaigns) {
          const provider = campaign.service_providers;
          if (!provider || !provider.location) continue;

          // Calculate distance using PostGIS function
          const { data: distanceData, error: distanceError } = await supabase.rpc("distance_between_points", {
            lat1: vehicle.latitude,
            lon1: vehicle.longitude,
            lat2: provider.latitude,
            lon2: provider.longitude,
          });

          let distanceKm: number;
          if (distanceError || distanceData === null || distanceData === undefined) {
            // Fallback to haversine calculation
            distanceKm = calculateHaversineDistance(
              vehicle.latitude,
              vehicle.longitude,
              provider.latitude,
              provider.longitude
            );
          } else {
            distanceKm = distanceData as number;
          }

          if (distanceKm <= campaign.target_radius_km) {
            // Check if ad was recently sent (throttling)
            const { data: recentlySent } = await supabase.rpc("was_ad_recently_sent", {
              p_campaign_id: campaign.id,
              p_device_id: vehicle.device_id,
              p_hours_threshold: 24,
            });

            if (!recentlySent) {
              nearbyDeals.push({
                campaign_id: campaign.id,
                provider_name: provider.business_name,
                title: campaign.title,
                description: campaign.description,
                distance_km: Math.round(distanceKm * 10) / 10,
                provider_lat: provider.latitude,
                provider_lon: provider.longitude,
              });
            }
          }
        }
      }

      // Limit to max 3 deals per message
      const dealsToShow = nearbyDeals.slice(0, 3);

      if (dealsToShow.length > 0) {
        // Get vehicle assignment to find user_id
        const { data: assignment } = await supabase
          .from("vehicle_assignments")
          .select("profile_id")
          .eq("device_id", vehicle.device_id)
          .single();

        if (!assignment) {
          console.log(`[match-ads] No assignment found for device ${vehicle.device_id}`);
          continue;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", assignment.profile_id)
          .single();

        if (!profile || !profile.user_id) {
          console.log(`[match-ads] No user_id found for device ${vehicle.device_id}`);
          continue;
        }

        // Generate message
        const dealsList = dealsToShow
          .map((deal) => `• ${deal.provider_name} - ${deal.title} (${deal.distance_km}km away)`)
          .join("\n");

        const message = `I noticed we're nearby some service deals within 5km:\n\n${dealsList}\n\n[View Local Deals →](/marketplace?lat=${vehicle.latitude}&lon=${vehicle.longitude}&radius=5)`;

        // Insert into vehicle_chat_history as assistant message
        const { error: chatError } = await supabase.from("vehicle_chat_history").insert({
          device_id: vehicle.device_id,
          user_id: profile.user_id,
          role: "assistant",
          content: message,
        });

        if (chatError) {
          console.error(`[match-ads] Error inserting chat message for ${vehicle.device_id}:`, chatError);
          continue;
        }

        // Log sent messages to prevent duplicates
        for (const deal of dealsToShow) {
          await supabase.from("ad_message_log").insert({
            campaign_id: deal.campaign_id,
            device_id: vehicle.device_id,
            message_content: message,
          });

        // Update campaign statistics (increment impressions)
        const { data: currentCampaign } = await supabase
          .from("ad_campaigns")
          .select("total_impressions")
          .eq("id", deal.campaign_id)
          .single();

        if (currentCampaign) {
          await supabase
            .from("ad_campaigns")
            .update({
              total_impressions: (currentCampaign.total_impressions || 0) + 1,
            })
            .eq("id", deal.campaign_id);
        }
        }

        totalMatched++;
        totalMessagesSent++;
        console.log(`[match-ads] Sent ad message to device ${vehicle.device_id} with ${dealsToShow.length} deals`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        matched: totalMatched,
        messages_sent: totalMessagesSent,
        campaigns_processed: activeCampaigns.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[match-ads] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Haversine distance calculation (fallback)
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
