import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Format date for GPS51 API
function formatDateForGps51(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Calculate distance between two GPS points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Backfill missing coordinates for a trip using position_history
async function backfillTripCoordinates(
  supabase: any,
  trip: any
): Promise<{ startLat: number; startLon: number; endLat: number; endLon: number; updated: boolean }> {
  let updated = false;
  let startLat = trip.start_latitude;
  let startLon = trip.start_longitude;
  let endLat = trip.end_latitude;
  let endLon = trip.end_longitude;

  // Check if coordinates need backfilling
  const needsStartBackfill = startLat === 0 || startLon === 0;
  const needsEndBackfill = endLat === 0 || endLon === 0;

  if (!needsStartBackfill && !needsEndBackfill) {
    return { startLat, startLon, endLat, endLon, updated: false };
  }

  // Extended backfill window: ±15 minutes (as per FIX #2)
  const BACKFILL_WINDOW_MINUTES = 15;

  // Backfill start coordinates
  if (needsStartBackfill) {
    const startTime = new Date(trip.start_time);
    const startTimeMin = new Date(startTime);
    startTimeMin.setMinutes(startTimeMin.getMinutes() - BACKFILL_WINDOW_MINUTES);
    const startTimeMax = new Date(startTime);
    startTimeMax.setMinutes(startTimeMax.getMinutes() + BACKFILL_WINDOW_MINUTES);

    const { data: startPoint } = await supabase
      .from("position_history")
      .select("latitude, longitude")
      .eq("device_id", trip.device_id)
      .gte("gps_time", startTimeMin.toISOString())
      .lte("gps_time", startTimeMax.toISOString())
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .neq("latitude", 0)
      .neq("longitude", 0)
      .order("gps_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (startPoint) {
      startLat = startPoint.latitude;
      startLon = startPoint.longitude;
      updated = true;
      console.log(`[reconcile] Backfilled start coordinates for trip ${trip.id}: ${startLat}, ${startLon}`);
    }
  }

  // Backfill end coordinates
  if (needsEndBackfill) {
    const endTime = new Date(trip.end_time);
    const endTimeMin = new Date(endTime);
    endTimeMin.setMinutes(endTimeMin.getMinutes() - BACKFILL_WINDOW_MINUTES);
    const endTimeMax = new Date(endTime);
    endTimeMax.setMinutes(endTimeMax.getMinutes() + BACKFILL_WINDOW_MINUTES);

    const { data: endPoint } = await supabase
      .from("position_history")
      .select("latitude, longitude")
      .eq("device_id", trip.device_id)
      .gte("gps_time", endTimeMin.toISOString())
      .lte("gps_time", endTimeMax.toISOString())
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .neq("latitude", 0)
      .neq("longitude", 0)
      .order("gps_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (endPoint) {
      endLat = endPoint.latitude;
      endLon = endPoint.longitude;
      updated = true;
      console.log(`[reconcile] Backfilled end coordinates for trip ${trip.id}: ${endLat}, ${endLon}`);
    }
  }

  return { startLat, startLon, endLat, endLon, updated };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[reconcile-gps51-data] Starting reconciliation");

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    let deviceId: string | null = null;
    let mode: "full" | "coordinates" | "gaps" = "full";
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    try {
      const body = await req.json();
      deviceId = body.deviceId || body.device_id || null;
      mode = body.mode || "full";
      if (body.startDate) startDate = new Date(body.startDate);
      if (body.endDate) endDate = new Date(body.endDate);
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Default date range: last 30 days
    if (!startDate) startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (!endDate) endDate = new Date();

    const results = {
      tripsFixed: 0,
      tripsChecked: 0,
      coordinatesBackfilled: 0,
      errors: [] as string[],
    };

    // Get trips to reconcile
    let query = supabase
      .from("vehicle_trips")
      .select("id, device_id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_km")
      .gte("start_time", startDate.toISOString())
      .lte("start_time", endDate.toISOString());

    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }

    // Find trips with missing coordinates
    if (mode === "full" || mode === "coordinates") {
      const { data: trips, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch trips: ${error.message}`);
      }

      console.log(`[reconcile] Found ${trips?.length || 0} trips to check`);

      if (trips) {
        for (const trip of trips) {
          results.tripsChecked++;

          // Check if coordinates need backfilling
          const needsBackfill =
            trip.start_latitude === 0 ||
            trip.start_longitude === 0 ||
            trip.end_latitude === 0 ||
            trip.end_longitude === 0;

          if (needsBackfill) {
            try {
              const { startLat, startLon, endLat, endLon, updated } = await backfillTripCoordinates(
                supabase,
                trip
              );

              if (updated) {
                // Update trip with backfilled coordinates
                const { error: updateError } = await supabase
                  .from("vehicle_trips")
                  .update({
                    start_latitude: startLat,
                    start_longitude: startLon,
                    end_latitude: endLat,
                    end_longitude: endLon,
                  })
                  .eq("id", trip.id);

                if (updateError) {
                  results.errors.push(`Failed to update trip ${trip.id}: ${updateError.message}`);
                } else {
                  results.tripsFixed++;
                  results.coordinatesBackfilled++;
                  console.log(`[reconcile] Fixed trip ${trip.id}`);
                }
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : "Unknown error";
              results.errors.push(`Error processing trip ${trip.id}: ${errorMsg}`);
            }
          }
        }
      }
    }

    // Gap detection (simplified - just reports gaps, doesn't fill them)
    // Full gap filling would require GPS51 queryhistory API calls
    if (mode === "full" || mode === "gaps") {
      console.log(`[reconcile] Gap detection not fully implemented - use gps-history-backfill function for gap filling`);
    }

    const duration = Date.now() - startTime;
    const response = {
      success: true,
      mode,
      deviceId: deviceId || "all",
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      results,
      duration_ms: duration,
    };

    console.log(`[reconcile-gps51-data] Completed:`, response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[reconcile-gps51-data] Fatal error: ${errorMessage}`);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
