
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = 'RBC784CX';

async function checkTelemetry() {
  console.log(`Checking telemetry (bypassing RLS) for device: ${deviceId}`);

  const { data, error } = await supabase
    .rpc('debug_check_telemetry', { p_device_id: deviceId });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('Telemetry Status:', JSON.stringify(data, null, 2));
  }
}

checkTelemetry();
