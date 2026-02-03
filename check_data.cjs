
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Anon key
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log("Checking vehicles table for RBC784CX...");
  const { data: vehicles, error: vError } = await supabase
    .from('vehicles')
    .select('id, device_id, device_name')
    .ilike('device_id', '%RBC784CX%');

  if (vError) console.error("Error fetching vehicles:", vError);
  else console.log("Vehicles found:", vehicles);

  console.log("\nChecking extensions...");
  const { data: extensions, error: eError } = await supabase.rpc('debug_check_extensions');
  
  if (eError) console.error("Error fetching extensions:", eError);
  else console.log("Extensions:", extensions);
}

checkData();
