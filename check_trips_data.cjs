
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const deviceId = 'RBC784CX';

async function checkStats() {
  console.log(`Checking data for device: ${deviceId}`);

  // 1. Debug Check Trips
  const { data: debugData, error: debugError } = await supabase
    .rpc('debug_check_trips', { p_device_id: deviceId });

  if (debugError) {
    console.error('Debug RPC Error:', debugError);
  } else {
    console.log('Debug Trips Data:', JSON.stringify(debugData, null, 2));
  }

  // 2. Daily Stats RPC
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_vehicle_daily_stats', {
      p_device_id: deviceId,
      p_days: 7
    });

  if (rpcError) {
    console.error('Stats RPC Error:', rpcError);
  } else {
    console.log('Stats RPC Data:', JSON.stringify(rpcData, null, 2));
  }
}

checkStats();
