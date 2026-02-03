
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = 'RBC784CX';

async function checkRawData() {
  console.log(`Checking telemetry for device: ${deviceId}`);

  // 1. Check vehicle_positions (Current Status) - minimal columns
  const { data: currentPos, error: currentError } = await supabase
    .from('vehicle_positions')
    .select('device_id, gps_time, speed, ignition_on, total_mileage')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (currentError) {
    console.error('Error fetching vehicle_positions:', currentError);
  } else {
    console.log('Current Position:', JSON.stringify(currentPos, null, 2));
  }
}

checkRawData();
