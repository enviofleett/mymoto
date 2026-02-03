import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://cmvpnsqiefbsqkwnraka.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo";
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const licensePlate = "RBC784CX";
  const today = "2026-02-02"; // From environment

  console.log(`Searching for vehicle: ${licensePlate}`);

  const { data: vehicles, error: vehicleError } = await supabase
    .from("vehicles")
    .select("device_id, name")
    .eq("license_plate", licensePlate);

  if (vehicleError) {
    console.error("Error fetching vehicle:", vehicleError);
    return;
  }

  if (!vehicles || vehicles.length === 0) {
    console.error("Vehicle not found");
    return;
  }

  const vehicle = vehicles[0];
  console.log(`Found vehicle: ${vehicle.name} (${vehicle.device_id})`);

  // Fetch daily stats
  console.log(`Fetching stats for ${today}...`);
  const { data: stats, error: statsError } = await supabase
    .from("vehicle_daily_stats")
    .select("*")
    .eq("device_id", vehicle.device_id)
    .eq("date", today);

  if (statsError) {
     console.error("Error fetching daily stats:", statsError);
  } else {
     console.log("Daily Stats:", JSON.stringify(stats, null, 2));
  }

  // Fetch trips for today
  // Using simplified ISO string for filter
  const startOfDay = `${today}T00:00:00`; 
  const endOfDay = `${today}T23:59:59`;

  const { data: trips, error: tripsError } = await supabase
    .from("vehicle_trips")
    .select("*")
    .eq("device_id", vehicle.device_id)
    .gte("start_time", startOfDay)
    .lte("start_time", endOfDay);

  if (tripsError) {
    console.error("Error fetching trips:", tripsError);
    return;
  }

  console.log(`Found ${trips?.length || 0} trips.`);
  
  let totalDistance = 0;
  let totalDuration = 0;

  trips?.forEach(trip => {
      totalDistance += trip.distance_km || 0;
      totalDuration += trip.duration_seconds || 0;
  });

  console.log(`Total Distance from trips: ${totalDistance.toFixed(2)} km`);
  console.log(`Total Duration from trips: ${totalDuration} seconds`);
}

main();
