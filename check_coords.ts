
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DEVICE_ID = '358657105966092';

async function checkTripData() {
  // Get recent position history to see if we have 0.0 coordinates
  const { data: positions, error } = await supabase
    .from('position_history')
    .select('gps_time, latitude, longitude, speed, ignition_on')
    .eq('device_id', DEVICE_ID)
    .order('gps_time', { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching positions:", error);
    return;
  }

  console.log(`Checked last 100 positions for ${DEVICE_ID}`);
  
  const zeroCoords = positions.filter(p => p.latitude === 0 || p.longitude === 0);
  const validCoords = positions.filter(p => p.latitude !== 0 && p.longitude !== 0);
  
  console.log(`Total points: ${positions.length}`);
  console.log(`Points with 0.0 coords: ${zeroCoords.length}`);
  console.log(`Points with valid coords: ${validCoords.length}`);
  
  if (zeroCoords.length > 0) {
    console.log("Sample 0.0 point:", zeroCoords[0]);
  }
  if (validCoords.length > 0) {
    console.log("Sample valid point:", validCoords[0]);
  }

  // Check the RPC output
  const { data: trips, error: rpcError } = await supabase.rpc('get_vehicle_trips_optimized', {
    p_device_id: DEVICE_ID,
    p_limit: 5
  });

  if (rpcError) {
    console.error("Error calling RPC:", rpcError);
  } else {
    console.log("Recent trips from RPC:");
    trips.forEach(t => {
      console.log(`- ${t.start_time} to ${t.end_time}: ${t.distance_km}km, Start: ${t.start_latitude},${t.start_longitude}`);
    });
  }
}

checkTripData();
