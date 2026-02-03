
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = "358657105966092"; // RBC784CX

async function checkDailyStats() {
  console.log(`Checking daily stats for device: ${deviceId}`);

  // 1. Try the RPC
  console.log("\n--- Testing RPC: get_vehicle_daily_stats ---");
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_vehicle_daily_stats', {
      p_device_id: deviceId,
      p_days: 7
    });

  if (rpcError) {
    console.error("RPC Error:", rpcError);
  } else {
    console.log("RPC Data:", JSON.stringify(rpcData, null, 2));
  }

  // 2. Try the View directly
  console.log("\n--- Testing View: vehicle_daily_stats ---");
  const { data: viewData, error: viewError } = await supabase
    .from("vehicle_daily_stats")
    .select("*")
    .eq("device_id", deviceId)
    .order("stat_date", { ascending: false })
    .limit(7);

  if (viewError) {
    console.error("View Error:", viewError);
  } else {
    console.log("View Data:", JSON.stringify(viewData, null, 2));
  }
}

checkDailyStats();
