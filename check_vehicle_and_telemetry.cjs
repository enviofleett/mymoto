const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVehicle() {
  const regNumber = 'RBC784CX';
  console.log(`Searching for vehicle: ${regNumber}`);

  // 1. Find Vehicle ID
  const { data: vehicles, error: vehicleError } = await supabase.rpc('debug_find_vehicle', {
    reg_num: regNumber
  });

  if (vehicleError) {
    console.error('Error finding vehicle:', vehicleError);
    return;
  }

  if (!vehicles || vehicles.length === 0) {
    console.log('No vehicle found with that registration number.');
    return;
  }

  const vehicle = vehicles[0];
  console.log('Vehicle found:', vehicle);
  const deviceId = vehicle.device_id;

  // 2. Check Telemetry using debug_check_telemetry
  /*
  console.log(`Checking telemetry for device_id: ${deviceId}`);
  const { data: telemetry, error: telemetryError } = await supabase.rpc('debug_check_telemetry', {
    p_device_id: deviceId
  });

  if (telemetryError) {
    console.error('Error checking telemetry:', telemetryError);
  } else {
    console.log('Telemetry Counts:');
    console.table(telemetry);
  }
  */

  // 3. Check Vehicle Trips View specifically (if not covered above)
  const { count: tripsCount, error: tripsError } = await supabase
    .from('vehicle_trips')
    .select('*', { count: 'exact', head: true })
    .eq('device_id', deviceId);
  
  if (tripsError) console.error('Error checking vehicle_trips view:', tripsError);
  else console.log(`vehicle_trips count (client check): ${tripsCount}`);

  // 4. Check Daily Stats
  const { data: stats, error: statsError } = await supabase
    .from('vehicle_daily_stats')
    .select('*')
    .eq('vehicle_id', deviceId) // Note: view uses vehicle_id or device_id? Check definition.
    // Migration 20260201130000_fix_view_and_restore_stats.sql didn't show vehicle_daily_stats definition, 
    // but usually it joins vehicle_trips.
    // Let's try device_id first, if fails try vehicle_id.
  
  if (statsError) {
    console.log('Error checking vehicle_daily_stats (trying vehicle_id):', statsError.message);
    // Try device_id
     const { data: stats2, error: statsError2 } = await supabase
        .from('vehicle_daily_stats')
        .select('*')
        .eq('device_id', deviceId);
     if (statsError2) console.error('Error checking vehicle_daily_stats (device_id):', statsError2);
     else {
       console.log('vehicle_daily_stats records:', stats2?.length);
       console.table(stats2);
     }
  } else {
    console.log('vehicle_daily_stats records:', stats?.length);
    console.table(stats);
  }
}

checkVehicle();
