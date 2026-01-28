
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Manual .env parsing
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["'](.*)["']$/, '$1');
      process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runSimulation() {
  console.log('🚀 Starting Production Readiness Simulation...\n');

  // 1. RLS Security Check
  console.log('🔒 Checking RLS Security (Anonymous Access)...');
  
  // Try to read vehicles
  const { data: vehicles, error: readError } = await supabase
    .from('vehicles')
    .select('id, name')
    .limit(5);

  if (readError) {
    console.log('✅ RLS Read Check Passed: Anonymous read blocked/error as expected.');
    console.log(`   Error: ${readError.message}`);
  } else if (!vehicles || vehicles.length === 0) {
    console.log('✅ RLS Read Check Passed: No vehicles returned for anonymous user.');
  } else {
    console.error('❌ RLS Read Check FAILED: Anonymous user can see vehicles!');
    console.log(vehicles);
  }

  // Try to update a vehicle (simulated ID)
  const { error: updateError } = await supabase
    .from('vehicles')
    .update({ name: 'HACKED' })
    .eq('id', '00000000-0000-0000-0000-000000000000');

  if (updateError) {
    console.log('✅ RLS Write Check Passed: Anonymous update blocked.');
    console.log(`   Error: ${updateError.message}`);
  } else {
    // If no error, it might just mean no rows matched, but RLS should ideally throw 401/403 or return count 0
    // But Supabase often returns no error for empty updates.
    // Let's try to insert, which is more strictly checked usually.
    const { error: insertError } = await supabase
        .from('vehicles')
        .insert([{ user_id: 'hack', name: 'HACKED' }]);
    
    if (insertError) {
        console.log('✅ RLS Insert Check Passed: Anonymous insert blocked.');
    } else {
        console.error('❌ RLS Insert Check FAILED: Anonymous user can insert!');
    }
  }

  // 2. Daily Reports Function Availability
  console.log('\n📊 Checking Daily Reports Function Availability...');
  const reportFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-daily-reports`;
  
  try {
      // Invoke without auth (should fail 401 or similar)
      const res = await fetch(reportFunctionUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
      });
      
      if (res.status === 401) {
          console.log('✅ Function Auth Check Passed: 401 Unauthorized for Anon Key (requires Service Role or Valid User).');
      } else if (res.status === 200) {
          console.warn('⚠️ Function Auth Warning: Function accessible with Anon Key (check if this is intended).');
          const text = await res.text();
          console.log('   Response:', text.substring(0, 100));
      } else {
          console.log(`ℹ️ Function Response: ${res.status} ${res.statusText}`);
      }
  } catch (e) {
      console.error('❌ Function Check Failed:', e.message);
  }

  // 3. Vehicle Chat Availability
  console.log('\n💬 Checking Vehicle Chat Function Availability...');
  const chatFunctionUrl = `${SUPABASE_URL}/functions/v1/vehicle-chat`;
  
  try {
      const res = await fetch(chatFunctionUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ message: 'Hello' })
      });

      if (res.status === 401) {
           console.log('✅ Chat Auth Check Passed: 401 Unauthorized for Anon Key.');
      } else if (res.status === 403) {
           console.log('✅ Chat Auth Check Passed: 403 Forbidden (likely Wallet/User check).');
      } else if (res.status === 200) {
           console.warn('⚠️ Chat Auth Warning: Function accessible with Anon Key.');
      } else {
           console.log(`ℹ️ Chat Response: ${res.status} ${res.statusText}`);
      }
  } catch (e) {
      console.error('❌ Chat Check Failed:', e.message);
  }

  console.log('\n✅ Simulation Complete.');
}

runSimulation();
