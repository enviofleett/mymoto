import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();
    const country = typeof body?.country === "string" ? body.country.trim() : "";
    const rawLimit = Number(body?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(10, Math.max(1, rawLimit)) : 5;

    if (!query) {
      return new Response(JSON.stringify({ features: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "MAPBOX_ACCESS_TOKEN is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      access_token: token,
      limit: String(limit),
      types: "place,address,poi,locality,neighborhood",
    });
    if (country) params.set("country", country);

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Mapbox geocoding failed: ${response.status}`, details: errorText }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    return new Response(JSON.stringify({ features }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[forward-geocode] error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
