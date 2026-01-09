import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get row counts for each table
    const tables = [
      "vehicles",
      "vehicle_positions",
      "position_history",
      "gps_api_logs",
      "vehicle_chat_history",
      "fleet_insights_history",
      "profiles",
      "wallets",
      "wallet_transactions",
      "vehicle_assignments",
      "vehicle_llm_settings",
    ];

    const tableStats = await Promise.all(
      tables.map(async (table) => {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });

        return {
          table,
          rowCount: error ? 0 : (count ?? 0),
        };
      })
    );

    // Get retention thresholds
    const retentionConfig = {
      gps_api_logs: "7 days",
      position_history: "30 days",
      vehicle_chat_history: "90 days",
      fleet_insights_history: "30 days",
    };

    // Get oldest records for retention status
    const retentionStatus = await Promise.all([
      supabase
        .from("gps_api_logs")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from("position_history")
        .select("recorded_at")
        .order("recorded_at", { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from("vehicle_chat_history")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .single(),
      supabase
        .from("fleet_insights_history")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .single(),
    ]);

    const oldestRecords = {
      gps_api_logs: retentionStatus[0].data?.created_at || null,
      position_history: retentionStatus[1].data?.recorded_at || null,
      vehicle_chat_history: retentionStatus[2].data?.created_at || null,
      fleet_insights_history: retentionStatus[3].data?.created_at || null,
    };

    // Estimate database size (rough calculation based on row counts)
    // These are approximate bytes per row based on typical data
    const bytesPerRow: Record<string, number> = {
      vehicles: 500,
      vehicle_positions: 300,
      position_history: 200,
      gps_api_logs: 2000,
      vehicle_chat_history: 1000,
      fleet_insights_history: 3000,
      profiles: 400,
      wallets: 200,
      wallet_transactions: 300,
      vehicle_assignments: 200,
      vehicle_llm_settings: 300,
    };

    let estimatedSizeBytes = 0;
    const tableSizes = tableStats.map((stat) => {
      const sizeBytes = stat.rowCount * (bytesPerRow[stat.table] || 200);
      estimatedSizeBytes += sizeBytes;
      return {
        ...stat,
        estimatedSizeMB: Math.round((sizeBytes / 1024 / 1024) * 100) / 100,
      };
    });

    const estimatedSizeMB = Math.round((estimatedSizeBytes / 1024 / 1024) * 100) / 100;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          tables: tableSizes.sort((a, b) => b.estimatedSizeMB - a.estimatedSizeMB),
          totalEstimatedSizeMB: estimatedSizeMB,
          retentionConfig,
          oldestRecords,
          freeTierLimitMB: 500,
          usagePercent: Math.round((estimatedSizeMB / 500) * 100),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Storage stats error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
