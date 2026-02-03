
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Anon key is fine now
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkToken() {
  const { data, error } = await supabase.rpc('debug_get_gps_token');

  if (error) {
    console.error("Error fetching token:", error);
  } else {
    console.log("Token data:", JSON.stringify(data, null, 2));
  }
}

checkToken();
