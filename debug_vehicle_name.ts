
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl, supabaseKey)

async function findVehicle() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('device_id, device_name')
    .ilike('device_name', '%Baby%')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Vehicles found:', data)
  }
}

findVehicle()
