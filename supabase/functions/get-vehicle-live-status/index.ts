import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGps51WithRateLimit, getValidGps51Token } from "../_shared/gps51-client.ts";
import { normalizeVehicleTelemetry } from "../_shared/telemetry-normalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Get Vehicle Live Status - Direct Proxy
 * 
 * Fetches the ABSOLUTE LATEST status from GPS51 for a single vehicle.
 * Bypasses the database cache to ensure "100% Live" data for the map/profile view.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { device_id } = await req.json();

    if (!device_id) {
      throw new Error('Missing device_id');
    }

    // 1. Get GPS51 Token
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL');
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL');

    const { token, serverid } = await getValidGps51Token(supabase);

    // 2. Call GPS51 `lastposition` for this specific device
    // We set lastquerypositiontime: 0 to force the latest data
    const result = await callGps51WithRateLimit(
      supabase,
      DO_PROXY_URL,
      'lastposition',
      token,
      serverid,
      {
        deviceids: [device_id],
        lastquerypositiontime: 0
      }
    );

    if (result.status !== 0 || !result.records || result.records.length === 0) {
      // If GPS51 fails, fallback to database (better than nothing)
      console.warn(`[get-vehicle-live-status] GPS51 fetch failed, falling back to DB for ${device_id}`);
      const { data: dbPos } = await supabase
        .from('vehicle_positions')
        .select('*')
        .eq('device_id', device_id)
        .maybeSingle();
        
      return new Response(JSON.stringify(dbPos || { error: 'No data available' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Normalize the data (so Frontend doesn't break)
    const rawRecord = result.records[0];
    const normalized = normalizeVehicleTelemetry(rawRecord, {
      offlineThresholdMs: 600000 // 10 mins
    });

    // 4. Async: Update the DB cache in the background (fire and forget)
    // We don't await this because we want to return FAST
    const updateDb = async () => {
      await supabase.from('vehicle_positions').upsert({
        device_id: normalized.vehicle_id,
        latitude: normalized.lat,
        longitude: normalized.lon,
        speed: normalized.speed_kmh,
        heading: normalized.heading,
        battery_percent: normalized.battery_level,
        ignition_on: normalized.ignition_on,
        is_online: normalized.is_online,
        gps_time: normalized.last_updated_at,
        cached_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'device_id' });
    };
    updateDb().catch(e => console.error('Background update failed:', e));

    // 5. Return the Live Data
    return new Response(
      JSON.stringify(normalized),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-vehicle-live-status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
