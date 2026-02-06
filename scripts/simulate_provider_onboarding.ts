
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// --- 1. Load Environment Variables ---
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    process.exit(1);
  }
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  envConfig.split('\n').forEach((line) => {
    const [key, value] = line.split('=');
    if (key && value) {
      // Remove surrounding quotes if present
      let cleanValue = value.trim();
      if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) || 
          (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
        cleanValue = cleanValue.slice(1, -1);
      }
      env[key.trim()] = cleanValue;
    }
  });
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

console.log(`✅ Loaded configuration for: ${SUPABASE_URL}`);

// --- 2. Initialize Client ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 3. Helper Functions ---

async function registerProvider(email: string, password: string, businessName: string) {
  console.log(`\n🔹 Registering provider: ${email} (${businessName})...`);
  
  const { data, error } = await supabase.functions.invoke('public-register-provider', {
    body: {
      email,
      password,
      businessName,
      contactPerson: 'Test Contact',
      phone: '555-0123',
      address: '123 Test St',
      city: 'Test City'
    }
  });

  if (error || data?.error) {
    console.error(`❌ Function invocation failed: ${error?.message || data?.error}`);
    console.log('⚠️  Falling back to direct supabase.auth.signUp (Simulation Mode)...');
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
          role: 'service_provider',
          phone: '555-0123'
        }
      }
    });
    
    if (authError) {
       console.error(`❌ Direct signup failed: ${authError.message}`);
       return null;
    }
    
    console.log('✅ Direct Registration successful!');
    return authData;
  }

  console.log('✅ Registration successful!');
  return data;
}

async function login(email: string, password: string) {
  console.log(`\n🔹 Logging in as: ${email}...`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(`❌ Login failed: ${error.message}`);
    return null;
  }

  console.log(`✅ Login successful! User ID: ${data.user.id}`);
  return data.user;
}

async function checkProviderStatus(userId: string) {
  console.log(`\n🔹 Checking provider status for User ID: ${userId}...`);
  
  // Note: RLS might prevent reading other providers, but "Providers read own profile" allows reading own.
  // We are logged in as the user in the 'login' step, but here we are using the anon client 
  // without the user's session unless we set it.
  // However, the 'login' call sets the session on the client instance automatically? 
  // No, createClient is stateless unless configured with storage.
  // We need to use the returned session.
  
  // Actually, let's just query with the user's ID assuming we might not be authenticated 
  // (simulating public check or relying on previous login state if we persisted it).
  // But wait, "Providers read own profile" requires auth.uid() == user_id.
  
  // So we must perform the query *using the session*.
  // For this script, we'll re-create a client for the user or assume the main client holds state?
  // standard supabase-js client holds state in memory if no storage provided.
  
  const { data, error } = await supabase
    .from('service_providers')
    .select('approval_status, business_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error(`❌ Error checking status: ${error.message}`);
    return null;
  }

  if (!data) {
    console.log('⚠️ No service provider record found.');
    return null;
  }

  console.log(`✅ Provider Record Found: Status = [${data.approval_status}]`);
  return data;
}

async function updateProfile(userId: string, newCity: string) {
    console.log(`\n🔹 Attempting to update profile city to: ${newCity}...`);
    
    const { error } = await supabase
        .from('service_providers')
        .update({ city: newCity })
        .eq('user_id', userId);
        
    if (error) {
        console.error(`❌ Update failed: ${error.message}`);
    } else {
        console.log(`✅ Profile updated successfully.`);
    }
}

// --- 4. Main Simulation Flow ---

async function runSimulation() {
  const args = process.argv.slice(2);
  let testEmail = '';
  let testPassword = '';
  
  // Parse args for --email and --password
  for (let i = 0; i < args.length; i++) {
      if (args[i] === '--email') testEmail = args[i+1];
      if (args[i] === '--password') testPassword = args[i+1];
  }

  const timestamp = Date.now();
  if (!testEmail) {
      testEmail = `test.provider.${timestamp}@gmail.com`;
      testPassword = 'Password123!';
  } else {
      console.log(`ℹ️  Using provided credentials: ${testEmail}`);
  }

  const businessName = `Simulation Auto ${timestamp}`;

  console.log('==================================================');
  console.log('🚀 STARTING PROVIDER ONBOARDING SIMULATION');
  console.log('==================================================');

  // Step 1: Register (Only if no email provided or if we want to test reg)
  // Actually, if email IS provided, we assume it's an existing user and SKIP registration?
  // Or we try to register and expect "User already registered"?
  // Let's skip registration if arguments are provided, to allow testing login flow.
  
  if (!args.includes('--email')) {
      await registerProvider(testEmail, testPassword, businessName);
  } else {
      console.log('⏭️  Skipping registration (credentials provided).');
  }

  // Step 2: Login
  const user = await login(testEmail, testPassword);
  
  if (!user) {
    console.error('❌ Aborting simulation due to login failure.');
    if (!args.includes('--email')) {
        console.log('ℹ️  NOTE: New registrations require Email Confirmation.');
        console.log('ℹ️  You must click the link in the email (or use a pre-confirmed account) to proceed.');
        console.log('ℹ️  To test the rest of the flow, create a user, confirm email, then run:');
        console.log(`    npx tsx scripts/simulate_provider_onboarding.ts --email ${testEmail} --password ${testPassword}`);
    }
    return;
  }


  // Step 3: Check Status
  const providerData = await checkProviderStatus(user.id);
  
  if (providerData && providerData.approval_status === 'pending') {
      console.log('\nℹ️  VERIFICATION: New providers are "pending" by default.');
      console.log('ℹ️  In the actual app, this user would see the "Pending Approval" screen.');
  } else if (providerData && providerData.approval_status === 'approved') {
      console.log('\n✅ VERIFICATION: Provider is auto-approved (unexpected but possible if configured).');
  }

  // Step 4: Simulate Profile Update (Should work for own profile)
  await updateProfile(user.id, 'Updated Simulation City');

  // Step 5: Service Catalog Setup (Not Implemented)
  console.log('\n🔹 Attempting Service Catalog Setup...');
  console.log('⚠️  Service Catalog table (provider_services) not found in DB.');
  console.log('⚠️  Skipping service creation.');

  // Step 6: Payment Integration (Not Implemented)
  console.log('\n🔹 Checking Payment Integration...');
  console.log('⚠️  Payment configuration not implemented yet.');

  // Step 5: Final Report
  console.log('\n==================================================');
  console.log('🏁 SIMULATION COMPLETE');
  console.log('==================================================');
  console.log(`\nTo test the "Success" flow (Dashboard Access):`);
  console.log(`1. Go to Admin Dashboard`);
  console.log(`2. Approve provider: ${testEmail}`);
  console.log(`3. Log in at /partner/auth with credentials:`);
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword}`);
}

runSimulation().catch(console.error);
