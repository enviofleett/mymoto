const { createClient } = require('@supabase/supabase-js');

// Hardcoded keys from .env
const SUPABASE_URL = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkHistory() {
  const deviceId = "13612339128";
  const start = "2026-02-08T00:00:00Z";
  const end = "2026-02-08T23:59:59Z";

  console.log(`Checking position_history for ${deviceId} on Feb 8...`);

  // 1. Count total points
  const { count, error: countError } = await supabase
    .from("position_history")
    .select("*", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("gps_time", start)
    .lte("gps_time", end);

  if (countError) {
    console.error("Error counting points:", countError.message);
    return;
  }
  console.log(`Total points found: ${count}`);

  if (count === 0) {
    console.log("No data found. Device was offline or no data synced.");
    return;
  }

  // 2. Check for movement (speed > 5 km/h)
  const { data: movingPoints, error: moveError } = await supabase
    .from("position_history")
    .select("gps_time, speed, latitude, longitude, ignition_on")
    .eq("device_id", deviceId)
    .gte("gps_time", start)
    .lte("gps_time", end)
    .gt("speed", 5) // > 5 km/h
    .limit(10);

  if (moveError) {
    console.error("Error checking movement:", moveError.message);
    return;
  }

  if (movingPoints.length > 0) {
    console.log(`Found ${movingPoints.length} moving points (> 5km/h):`);
    movingPoints.forEach(p => console.log(`  - ${p.gps_time}: ${p.speed} km/h, Ign: ${p.ignition_on}`));
  } else {
    console.log("No points with speed > 5 km/h found.");
  }

  // 3. Check for ignition ON
  const { data: ignPoints, error: ignError } = await supabase
    .from("position_history")
    .select("gps_time, speed, latitude, longitude, ignition_on")
    .eq("device_id", deviceId)
    .gte("gps_time", start)
    .lte("gps_time", end)
    .eq("ignition_on", true)
    .limit(10);

  if (ignError) {
    console.error("Error checking ignition:", ignError.message);
    return;
  }

  if (ignPoints.length > 0) {
    console.log(`Found ${ignPoints.length} ignition ON points:`);
    ignPoints.forEach(p => console.log(`  - ${p.gps_time}: ${p.speed} km/h, Ign: ${p.ignition_on}`));
  } else {
    console.log("No ignition ON points found.");
  }
}

checkHistory();
