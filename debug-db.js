
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cmvpnsqiefbsqkwnraka.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdnBuc3FpZWZic3Frd25yYWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MjIwMDEsImV4cCI6MjA4MzI5ODAwMX0.nJLb5znjUiGsCk_S2QubhBtqIl3DB3I8LbZihIMJdwo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('Calling get_debug_providers RPC...');
  const { data, error } = await supabase.rpc('get_debug_providers');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

checkData();
