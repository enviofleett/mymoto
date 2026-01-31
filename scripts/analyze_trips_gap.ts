
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://cmvpnsqiefbsqkwnraka.supabase.co";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcyMjAwMSwiZXhwIjoyMDgzMjk4MDAxfQ.d5LxnXgAPC7icY_4nzxmmANz4drZ3dX7lnr97XNoFVs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeTrips() {
  const deviceId = "358657105966092";
  const { data: trips, error } = await supabase
    .from("vehicle_trips")
    .select("*")
    .eq("device_id", deviceId)
    .gte("start_time", "2026-01-29T23:00:00Z") // Jan 30 Lagos (UTC+1)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Error fetching trips:", error);
    return;
  }

  console.log(`Found ${trips.length} trips for device ${deviceId} on Jan 30`);
  
  for (let i = 0; i < trips.length; i++) {
    const trip = trips[i];
    console.log(`\nTrip ${i + 1}:`);
    console.log(`  Time: ${trip.start_time} -> ${trip.end_time}`);
    console.log(`  Coords: (${trip.start_latitude}, ${trip.start_longitude}) -> (${trip.end_latitude}, ${trip.end_longitude})`);
    console.log(`  Distance: ${trip.distance_km}km`);
    
    if (i > 0) {
      const prevTrip = trips[i - 1];
      const dist = calculateDistance(
        prevTrip.end_latitude, prevTrip.end_longitude,
        trip.start_latitude, trip.start_longitude
      );
      console.log(`  GAP from Trip ${i}: ${dist.toFixed(3)} km`);
      
      // If gap is large, check for missing positions
      if (dist > 0.1) {
          console.log(`  Checking position history for gap...`);
          const { data: positions } = await supabase
            .from("position_history")
            .select("gps_time, latitude, longitude, speed, ignition_on")
            .eq("device_id", deviceId)
            .gt("gps_time", prevTrip.end_time)
            .lt("gps_time", trip.start_time)
            .order("gps_time");
            
          console.log(`  Found ${positions?.length || 0} points in gap.`);
          if (positions && positions.length > 0) {
              console.log(`  First point in gap: ${positions[0].gps_time} (${positions[0].latitude}, ${positions[0].longitude})`);
              console.log(`  Last point in gap: ${positions[positions.length-1].gps_time} (${positions[positions.length-1].latitude}, ${positions[positions.length-1].longitude})`);
          }
      }
    }
  }
}

// Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
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

analyzeTrips();
