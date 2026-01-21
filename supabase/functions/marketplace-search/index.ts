import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  latitude: number;
  longitude: number;
  radius_km?: number;
  category_id?: string;
  limit?: number;
  offset?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: SearchRequest = await req.json();

    // Input validation
    const { latitude, longitude, radius_km = 3, category_id, limit = 20, offset = 0 } = body;

    // Validate coordinates
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required and must be numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (latitude < -90 || latitude > 90) {
      return new Response(
        JSON.stringify({ error: "latitude must be between -90 and 90" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (longitude < -180 || longitude > 180) {
      return new Response(
        JSON.stringify({ error: "longitude must be between -180 and 180" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate radius (max 50km for safety)
    const safeRadius = Math.min(Math.max(radius_km, 1), 50);

    // Validate pagination
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    console.log(`[marketplace-search] Searching providers near (${latitude}, ${longitude}) within ${safeRadius}km`);

    // Call the database function for geo-search
    const { data: providers, error } = await supabase.rpc("search_providers_nearby", {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_km: safeRadius,
      p_category_id: category_id || null,
    });

    if (error) {
      console.error("[marketplace-search] Database error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to search providers", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply pagination
    const paginatedProviders = providers?.slice(safeOffset, safeOffset + safeLimit) || [];

    // For each provider, fetch their approved services
    const providersWithServices = await Promise.all(
      paginatedProviders.map(async (provider: any) => {
        const { data: services } = await supabase
          .from("marketplace_services")
          .select("id, title, description, price, currency, duration_minutes, image_url")
          .eq("provider_id", provider.id)
          .eq("is_approved", true)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        return {
          ...provider,
          services: services || [],
        };
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        providers: providersWithServices,
        pagination: {
          total: providers?.length || 0,
          limit: safeLimit,
          offset: safeOffset,
          has_more: (providers?.length || 0) > safeOffset + safeLimit,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[marketplace-search] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
