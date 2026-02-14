import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Sync Trips Incremental (Orchestrator)
 * 
 * This function replaces the legacy incremental sync logic.
 * It now acts as an orchestrator that:
 * 1. Identifies active vehicles that need syncing
 * 2. Batches them (prioritizing those not synced recently)
 * 3. Invokes the `sync-gps51-trips` function for each vehicle
 * 
 * This ensures we use the robust, 100% accurate GPS51 direct sync
 * while maintaining the existing cron job schedule.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Get all vehicles
    const { data: vehicles, error: vError } = await supabase
      .from('vehicles')
      .select('device_id');

    if (vError) throw new Error(`Error fetching vehicles: ${vError.message}`);
    if (!vehicles || vehicles.length === 0) {
      return new Response(JSON.stringify({ message: 'No active vehicles found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get sync status for these vehicles
    const deviceIds = vehicles.map(v => v.device_id);
    const { data: statuses, error: sError } = await supabase
      .from('gps51_sync_status')
      .select('device_id, last_trip_sync_at')
      .in('device_id', deviceIds);

    if (sError) throw new Error(`Error fetching sync status: ${sError.message}`);

    // 3. Prioritize vehicles (oldest sync first)
    const statusMap = new Map(statuses?.map(s => [s.device_id, s.last_trip_sync_at]) || []);
    
    const queue = vehicles.map(v => ({
      device_id: v.device_id,
      last_sync: statusMap.get(v.device_id) || new Date(0).toISOString() // Epoch if never synced
    }));

    // Sort: oldest sync first
    queue.sort((a, b) => new Date(a.last_sync).getTime() - new Date(b.last_sync).getTime());

    // 4. Process a batch (limit to 10 to avoid timeouts)
    const BATCH_SIZE = 10;
    const batch = queue.slice(0, BATCH_SIZE);

    console.log(`[sync-trips-incremental] Processing batch of ${batch.length} vehicles`);

    const results = [];
    
    // 5. Invoke sync-gps51-trips for each vehicle
    // We call the function directly via HTTP to ensure it runs
    const functionUrl = `${supabaseUrl}/functions/v1/sync-gps51-trips`;
    
    for (const item of batch) {
      try {
        console.log(`[sync-trips-incremental] Triggering sync for ${item.device_id}`);
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            deviceid: item.device_id,
            // Default time range is handled by the function (last 7 days)
          }),
        });

        const resultText = await response.text();
        let resultJson;
        try {
          resultJson = JSON.parse(resultText);
        } catch {
          resultJson = { raw: resultText };
        }

        results.push({
          device_id: item.device_id,
          status: response.status,
          success: response.ok,
          result: resultJson
        });
        
      } catch (err) {
        console.error(`[sync-trips-incremental] Error invoking sync for ${item.device_id}:`, err);
        results.push({
          device_id: item.device_id,
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed: batch.length, 
      total_queued: queue.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sync-trips-incremental] Fatal error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
