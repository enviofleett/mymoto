// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SpeedUnit = "kmh" | "mph";

type SaveVehicleSettingsRequest = {
  device_id: string;
  plate_number?: string | null;
  vin?: string | null;
  color?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuel_type?: string | null;
  engine_displacement?: string | null;
  official_fuel_efficiency_l_100km?: number | null;
  vehicle_type?: string | null;
  driving_region_or_country?: string | null;
  usage_weight?: string | null;
  speed_limit?: number | null;
  speed_unit?: SpeedUnit | null;
};

const VIN_ALLOWED = /^[A-HJ-NPR-Z0-9]{17}$/i;

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Supabase environment not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return jsonResponse({ error: "Missing access token" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      // Pass through the actual error message so the client-side retry logic
      // can detect "JWT expired" and refresh the token before retrying.
      return jsonResponse({ error: userError?.message || "Unauthorized" }, 401);
    }

    const body = (await req.json()) as SaveVehicleSettingsRequest;
    const deviceId = cleanText(body.device_id);

    if (!deviceId) {
      return jsonResponse({ error: "device_id is required" }, 400);
    }

    const plateNumber = normalizePlate(body.plate_number);
    const vin = cleanText(body.vin)?.toUpperCase() ?? null;
    const color = cleanText(body.color);
    const make = cleanText(body.make);
    const model = cleanText(body.model);
    const year = cleanNumber(body.year);
    const fuelType = cleanText(body.fuel_type)?.toLowerCase() ?? null;
    const engineDisplacement = cleanText(body.engine_displacement);
    const officialFuelEfficiency = cleanNumber(body.official_fuel_efficiency_l_100km);
    const vehicleType = cleanText(body.vehicle_type);
    const drivingRegion = cleanText(body.driving_region_or_country);
    const usageWeight = cleanText(body.usage_weight);
    const speedLimit = cleanNumber(body.speed_limit);

    const speedUnit =
      body.speed_unit === "kmh" || body.speed_unit === "mph" ? body.speed_unit : ("kmh" as SpeedUnit);

    const currentYear = new Date().getFullYear();

    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > currentYear)) {
      return jsonResponse({ error: `year must be between 1900 and ${currentYear}` }, 400);
    }

    if (vin && !VIN_ALLOWED.test(vin)) {
      return jsonResponse({ error: "vin must be 17 characters (A-HJ-NPR-Z0-9)" }, 400);
    }

    if (
      officialFuelEfficiency !== null &&
      (officialFuelEfficiency <= 0 || officialFuelEfficiency > 40)
    ) {
      return jsonResponse({ error: "official_fuel_efficiency_l_100km must be > 0 and <= 40" }, 400);
    }

    if (speedLimit !== null && (speedLimit <= 0 || speedLimit > 300)) {
      return jsonResponse({ error: "speed_limit must be > 0 and <= 300" }, 400);
    }

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("device_id")
      .eq("device_id", deviceId)
      .maybeSingle();

    if (vehicleError) {
      return jsonResponse({ error: "Failed to load vehicle" }, 500);
    }

    if (!vehicle) {
      return jsonResponse({ error: "Vehicle not found" }, 404);
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError) {
      return jsonResponse({ error: "Failed to check role" }, 500);
    }

    if (!isAdmin) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("vehicle_assignments")
        .select("device_id, profiles!inner(user_id)")
        .eq("device_id", deviceId)
        .eq("profiles.user_id", user.id)
        .limit(1);

      if (assignmentError) {
        return jsonResponse({ error: "Failed to check vehicle assignment" }, 500);
      }

      if (!assignments || assignments.length === 0) {
        return jsonResponse({ error: "Forbidden: no access to this vehicle" }, 403);
      }
    }

    const updates = {
      plate_number: plateNumber,
      vin,
      color,
      make,
      model,
      year,
      fuel_type: fuelType,
      engine_displacement: engineDisplacement,
      official_fuel_efficiency_l_100km: officialFuelEfficiency,
      vehicle_type: vehicleType,
      driving_region_or_country: drivingRegion,
      usage_weight: usageWeight,
      speed_limit: speedLimit,
      speed_unit: speedUnit,
    };

    const { data: saved, error: saveError } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("device_id", deviceId)
      .select(
        "device_id, plate_number, vin, color, make, model, year, fuel_type, engine_displacement, official_fuel_efficiency_l_100km, vehicle_type, driving_region_or_country, usage_weight, speed_limit, speed_unit",
      )
      .maybeSingle();

    if (saveError) {
      return jsonResponse({ error: `Failed to save settings: ${saveError.message}` }, 500);
    }

    return jsonResponse({ success: true, data: saved });
  } catch (error: any) {
    return jsonResponse({ error: error?.message || "Unexpected error" }, 500);
  }
});
