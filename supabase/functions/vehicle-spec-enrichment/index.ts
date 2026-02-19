// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callLLM } from "../_shared/llm-client.ts";
import { buildUpdatePayload, normaliseKey, type EnrichedSpecs } from "./spec-helpers.ts";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EnrichmentRequest = {
  device_id: string;
  brand: string;
  model: string;
  year?: number;
  fuel_type?: string | null;
  vehicle_type?: string | null;
};

type CatalogSpec = {
  fuel_type: string | null;
  engine_displacement: string | null;
  official_fuel_efficiency_l_100km: number | null;
  vehicle_type: string | null;
  usage_weight: string | null;
};

const KNOWN_SPECS: Record<string, EnrichedSpecs> = {
  "toyota|corolla cross": {
    fuel_type: "hybrid",
    engine_displacement: "1.8 Hybrid",
    official_fuel_efficiency_l_100km: 4.1,
    vehicle_type: "SUV",
    usage_weight: "light",
  },
  "toyota|rav4": {
    fuel_type: "hybrid",
    engine_displacement: "2.5 Hybrid",
    official_fuel_efficiency_l_100km: 4.8,
    vehicle_type: "SUV",
    usage_weight: "normal",
  },
  "toyota|hilux 2.4 gd-6": {
    fuel_type: "diesel",
    engine_displacement: "2.4L",
    official_fuel_efficiency_l_100km: 7.9,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "toyota|hilux 2.8 gd-6": {
    fuel_type: "diesel",
    engine_displacement: "2.8L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "toyota|fortuner 2.4 gd-6": {
    fuel_type: "diesel",
    engine_displacement: "2.4L",
    official_fuel_efficiency_l_100km: 7.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "toyota|fortuner 2.8 gd-6": {
    fuel_type: "diesel",
    engine_displacement: "2.8L",
    official_fuel_efficiency_l_100km: 8.3,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "toyota|land cruiser prado 2.8 d-4d": {
    fuel_type: "diesel",
    engine_displacement: "2.8L",
    official_fuel_efficiency_l_100km: 9.5,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "toyota|land cruiser 300 3.5 v6": {
    fuel_type: "petrol",
    engine_displacement: "3.5L V6 Twin-Turbo",
    official_fuel_efficiency_l_100km: 12.5,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "toyota|land cruiser 79 4.5 v8": {
    fuel_type: "diesel",
    engine_displacement: "4.5L V8",
    official_fuel_efficiency_l_100km: 11.5,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "toyota|corolla quest": {
    fuel_type: "petrol",
    engine_displacement: "1.8L",
    official_fuel_efficiency_l_100km: 6.5,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "toyota|vitz": {
    fuel_type: "petrol",
    engine_displacement: "1.0L",
    official_fuel_efficiency_l_100km: 4.2,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "toyota|agya": {
    fuel_type: "petrol",
    engine_displacement: "1.0L",
    official_fuel_efficiency_l_100km: 4.3,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "toyota|avanza": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 6.8,
    vehicle_type: "mpv",
    usage_weight: "normal",
  },
  "toyota|rush": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 6.9,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "toyota|hiace 2.5 d-4d": {
    fuel_type: "diesel",
    engine_displacement: "2.5L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "van",
    usage_weight: "heavy",
  },
  "lexus|lx570": {
    fuel_type: "petrol",
    engine_displacement: "5.7L V8",
    official_fuel_efficiency_l_100km: 14.4,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "lexus|rx350": {
    fuel_type: "petrol",
    engine_displacement: "3.5L V6",
    official_fuel_efficiency_l_100km: 10.2,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "lexus|rx450h": {
    fuel_type: "hybrid",
    engine_displacement: "3.5L Hybrid",
    official_fuel_efficiency_l_100km: 6.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "lexus|es350": {
    fuel_type: "petrol",
    engine_displacement: "3.5L V6",
    official_fuel_efficiency_l_100km: 8.9,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "lexus|gx460": {
    fuel_type: "petrol",
    engine_displacement: "4.6L V8",
    official_fuel_efficiency_l_100km: 13.5,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "bmw|x3 20d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 6.4,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "bmw|x5 30d": {
    fuel_type: "diesel",
    engine_displacement: "3.0L",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "bmw|3 series 320d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 5.2,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "bmw|5 series 520d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 5.5,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "bmw|x1 sdrive18d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 5.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "bmw|7 series 730ld": {
    fuel_type: "diesel",
    engine_displacement: "3.0L",
    official_fuel_efficiency_l_100km: 6.5,
    vehicle_type: "sedan",
    usage_weight: "heavy",
  },
  "suzuki|dzire 1.2": {
    fuel_type: "petrol",
    engine_displacement: "1.2L",
    official_fuel_efficiency_l_100km: 6.0,
    vehicle_type: "sedan",
    usage_weight: "light",
  },
  "suzuki|swift 1.2": {
    fuel_type: "petrol",
    engine_displacement: "1.2L",
    official_fuel_efficiency_l_100km: 4.8,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "suzuki|celerio 1.0": {
    fuel_type: "petrol",
    engine_displacement: "1.0L",
    official_fuel_efficiency_l_100km: 4.2,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "suzuki|s-presso 1.0": {
    fuel_type: "petrol",
    engine_displacement: "1.0L",
    official_fuel_efficiency_l_100km: 4.4,
    vehicle_type: "crossover",
    usage_weight: "light",
  },
  "suzuki|vitara 1.6": {
    fuel_type: "petrol",
    engine_displacement: "1.6L",
    official_fuel_efficiency_l_100km: 6.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "suzuki|jimny 1.5": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 7.2,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "suzuki|ertiga 1.5": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 6.2,
    vehicle_type: "mpv",
    usage_weight: "normal",
  },
  "mercedes-benz|vito 116 cdi": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 6.9,
    vehicle_type: "van",
    usage_weight: "heavy",
  },
  "mercedes-benz|c200": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 7.2,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "mercedes-benz|e220d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 5.8,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "mercedes-benz|gle 300d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.8,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "mercedes-benz|glc 220d": {
    fuel_type: "diesel",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 6.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "gac|gs3 emzoom": {
    fuel_type: "petrol",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 6.2,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "gac|gs8": {
    fuel_type: "petrol",
    engine_displacement: "2.0T",
    official_fuel_efficiency_l_100km: 9.5,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "gac|gs5": {
    fuel_type: "petrol",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 7.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "gac|gn6": {
    fuel_type: "petrol",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "mpv",
    usage_weight: "normal",
  },
  "geely|emgrand 7": {
    fuel_type: "petrol",
    engine_displacement: "1.5L",
    official_fuel_efficiency_l_100km: 6.59,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "geely|coolray": {
    fuel_type: "petrol",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 6.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "geely|okavango": {
    fuel_type: "petrol",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 8.0,
    vehicle_type: "mpv",
    usage_weight: "heavy",
  },
  "peugeot|108": {
    fuel_type: "petrol",
    engine_displacement: "1.0L",
    official_fuel_efficiency_l_100km: 5.6,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "peugeot|3008": {
    fuel_type: "diesel",
    engine_displacement: "1.6L",
    official_fuel_efficiency_l_100km: 6.2,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "peugeot|landtrek": {
    fuel_type: "diesel",
    engine_displacement: "1.9L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "innoson|g5": {
    fuel_type: "petrol",
    engine_displacement: "2.5L V6",
    official_fuel_efficiency_l_100km: 11.5,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "innoson|u5": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "mazda|cx-5 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.2,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "mazda|mazda 3 1.6": {
    fuel_type: "petrol",
    engine_displacement: "1.6L",
    official_fuel_efficiency_l_100km: 6.5,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "honda|accord 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.8,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "honda|civic 1.8": {
    fuel_type: "petrol",
    engine_displacement: "1.8L",
    official_fuel_efficiency_l_100km: 6.8,
    vehicle_type: "sedan",
    usage_weight: "normal",
  },
  "honda|cr-v 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "nissan|navara 2.5d": {
    fuel_type: "diesel",
    engine_displacement: "2.5L",
    official_fuel_efficiency_l_100km: 8.2,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "nissan|x-trail 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "ford|ranger 2.2": {
    fuel_type: "diesel",
    engine_displacement: "2.2L",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "ford|ranger 3.2": {
    fuel_type: "diesel",
    engine_displacement: "3.2L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
  "hyundai|tucson 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.5,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "kia|sportage 2.0": {
    fuel_type: "petrol",
    engine_displacement: "2.0L",
    official_fuel_efficiency_l_100km: 7.8,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "volkswagen|polo vivo 1.4": {
    fuel_type: "petrol",
    engine_displacement: "1.4L",
    official_fuel_efficiency_l_100km: 5.9,
    vehicle_type: "hatchback",
    usage_weight: "light",
  },
  "haval|h6 1.5t hybrid": {
    fuel_type: "hybrid",
    engine_displacement: "1.5T",
    official_fuel_efficiency_l_100km: 5.9,
    vehicle_type: "suv",
    usage_weight: "normal",
  },
  "mahindra|scorpio 2.2d": {
    fuel_type: "diesel",
    engine_displacement: "2.2L",
    official_fuel_efficiency_l_100km: 8.5,
    vehicle_type: "suv",
    usage_weight: "heavy",
  },
  "isuzu|d-max 1.9d": {
    fuel_type: "diesel",
    engine_displacement: "1.9L",
    official_fuel_efficiency_l_100km: 7.3,
    vehicle_type: "pickup",
    usage_weight: "heavy",
  },
};

async function fetchCatalogSpec(supabase: any, normalizedKey: string): Promise<CatalogSpec | null> {
  const { data, error } = await supabase
    .from("vehicle_fuel_specs_catalog")
    .select(
      "fuel_type, engine_displacement, official_fuel_efficiency_l_100km, vehicle_type, usage_weight",
    )
    .eq("normalized_key", normalizedKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.warn(`[vehicle-spec-enrichment] catalog_lookup_error key=${normalizedKey} message=${error.message}`);
    return null;
  }

  return (data as CatalogSpec | null) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as EnrichmentRequest;
    const { device_id, brand, model, year, fuel_type, vehicle_type } = body;

    if (!device_id || !brand || !model) {
      return new Response(
        JSON.stringify({ error: "device_id, brand, and model are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("device_id")
      .eq("device_id", device_id)
      .maybeSingle();

    if (vehicleError) {
      return new Response(
        JSON.stringify({ error: "Failed to load vehicle" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!vehicle) {
      return new Response(
        JSON.stringify({ error: "Vehicle not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const key = normaliseKey(brand, model);
    const catalogSpec = await fetchCatalogSpec(supabase, key);

    if (catalogSpec) {
      console.log(`[vehicle-spec-enrichment] catalog_hit key=${key}`);
      const updatePayload = buildUpdatePayload(catalogSpec);

      const { error: updateError } = await supabase
        .from("vehicles")
        .update(updatePayload)
        .eq("device_id", device_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update vehicle specs" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: updatePayload }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const known = KNOWN_SPECS[key];

    if (known) {
      console.log(`[vehicle-spec-enrichment] fallback_known_specs_hit key=${key}`);
      const updatePayload = buildUpdatePayload(known);

      const { error: updateError } = await supabase
        .from("vehicles")
        .update(updatePayload)
        .eq("device_id", device_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update vehicle specs" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: updatePayload }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("vehicle_assignments")
      .select("profiles(user_id)")
      .eq("device_id", device_id);

    if (assignmentsError) {
      return new Response(
        JSON.stringify({ error: "Failed to load assignments" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userIds = (assignments || [])
      .map((a: any) => a.profiles?.user_id)
      .filter((id: any) => typeof id === "string");

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No users assigned to this vehicle" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: eligibleWallets, error: walletError } = await supabase
      .from("wallets")
      .select("user_id")
      .in("user_id", userIds)
      .gt("balance", 0);

    if (walletError) {
      return new Response(
        JSON.stringify({ error: "Failed to check wallet balance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!eligibleWallets || eligibleWallets.length === 0) {
      return new Response(
        JSON.stringify({ error: "Insufficient wallet balance for AI enrichment" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: llmSettings } = await supabase
      .from("vehicle_llm_settings")
      .select("llm_enabled")
      .eq("device_id", device_id)
      .maybeSingle();

    if (llmSettings && llmSettings.llm_enabled === false) {
      return new Response(
        JSON.stringify({ error: "AI companion is disabled for this vehicle" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt =
      "You are an automotive specifications assistant. Use manufacturer data and reliable references to infer typical specifications for a given vehicle. " +
      "Return a compact JSON object only, with no explanation or extra text. Numbers must use a dot as decimal separator.";

    const userPromptParts = [
      `Brand: ${brand}`,
      `Model: ${model}`,
      year ? `Year: ${year}` : "Year: unknown",
      fuel_type ? `Fuel type: ${fuel_type}` : "Fuel type: unknown",
      vehicle_type ? `Vehicle type: ${vehicle_type}` : "Vehicle type: unknown",
    ];

    const userPrompt =
      userPromptParts.join("\n") +
      "\n\nReturn JSON with keys: fuel_type, engine_displacement, official_fuel_efficiency_l_100km, vehicle_type, usage_weight. " +
      "official_fuel_efficiency_l_100km should be a single representative combined value in L/100km. " +
      "usage_weight should be a short description like 'light', 'normal', 'heavy', or an approximate kg/tons string. " +
      "If you are unsure, use null values instead of guessing wildly.";

    console.log(`[vehicle-spec-enrichment] llm_fallback_hit key=${key}`);

    const llmResult = await callLLM(systemPrompt, userPrompt, {
      maxOutputTokens: 256,
      temperature: 0.2,
    });

    const rawText = llmResult.text || "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        return new Response(
          JSON.stringify({ error: "LLM response was not valid JSON" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const jsonSlice = rawText.slice(start, end + 1);
      try {
        parsed = JSON.parse(jsonSlice);
      } catch {
        return new Response(
          JSON.stringify({ error: "Failed to parse LLM JSON response" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const specs: EnrichedSpecs = {};

    if (typeof parsed.fuel_type === "string" || parsed.fuel_type === null) {
      specs.fuel_type = parsed.fuel_type;
    }

    if (typeof parsed.engine_displacement === "string" || parsed.engine_displacement === null) {
      specs.engine_displacement = parsed.engine_displacement;
    }

    if (
      typeof parsed.official_fuel_efficiency_l_100km === "number" ||
      parsed.official_fuel_efficiency_l_100km === null
    ) {
      specs.official_fuel_efficiency_l_100km = parsed.official_fuel_efficiency_l_100km;
    } else if (typeof parsed.official_fuel_efficiency_l_100km === "string") {
      const num = Number(parsed.official_fuel_efficiency_l_100km.replace(",", "."));
      if (!Number.isNaN(num)) {
        specs.official_fuel_efficiency_l_100km = num;
      }
    }

    if (typeof parsed.vehicle_type === "string" || parsed.vehicle_type === null) {
      specs.vehicle_type = parsed.vehicle_type;
    }

    if (typeof parsed.usage_weight === "string" || parsed.usage_weight === null) {
      specs.usage_weight = parsed.usage_weight;
    }

  if (!specs.usage_weight) {
    const vt = (specs.vehicle_type ?? vehicle_type ?? "").toLowerCase();
    if (vt.includes("truck") || vt.includes("pickup") || vt.includes("van") || vt.includes("bus")) {
      specs.usage_weight = "heavy";
    } else if (vt.includes("motorcycle") || vt.includes("tricycle") || vt.includes("scooter")) {
      specs.usage_weight = "commercial";
    } else if (vt) {
      specs.usage_weight = "normal";
    }
  }

    const updatePayload = buildUpdatePayload(specs);

    const { error: updateError } = await supabase
      .from("vehicles")
      .update(updatePayload)
      .eq("device_id", device_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update vehicle specs" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: updatePayload }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
