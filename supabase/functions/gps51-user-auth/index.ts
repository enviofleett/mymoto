import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import blueimp_md5 from 'https://esm.sh/blueimp-md5@2.19.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MD5 hash function using blueimp-md5 library
function md5(text: string): string {
  return blueimp_md5(text);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username and password are required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gps51-user-auth] Attempting login for: ${username}`);

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const proxyUrl = Deno.env.get('DO_PROXY_URL');
    if (!proxyUrl) {
      throw new Error('DO_PROXY_URL not configured');
    }

    // Step 1: Hash password with MD5
    const passwordHash = md5(password);
    console.log(`[gps51-user-auth] Password hashed`);

    // Step 2: Verify credentials with GPS51 API via proxy
    const loginPayload = {
      targetUrl: 'https://api.gps51.com/openapi?action=login',
      method: 'POST',
      data: {
        type: 'USER',
        from: 'web',
        username: username,
        password: passwordHash,
        browser: 'Chrome/120.0.0.0'
      }
    };

    console.log(`[gps51-user-auth] Calling GPS51 login API`);
    const loginResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload)
    });

    const loginText = await loginResponse.text();
    console.log(`[gps51-user-auth] Login response: ${loginText.substring(0, 200)}`);

    let loginData;
    try {
      loginData = JSON.parse(loginText);
    } catch (e) {
      console.error(`[gps51-user-auth] Failed to parse login response`);
      // Log the error
      await supabaseAdmin.from('gps_api_logs').insert({
        action: 'gps51-user-auth-login',
        request_body: loginPayload,
        response_status: loginResponse.status,
        response_body: { raw: loginText.substring(0, 500) },
        error_message: 'Failed to parse response'
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to connect to GPS51. Please try again.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the API call
    await supabaseAdmin.from('gps_api_logs').insert({
      action: 'gps51-user-auth-login',
      request_body: loginPayload,
      response_status: loginResponse.status,
      response_body: loginData
    });

    // Check if login was successful
    if (loginData.status !== 0) {
      console.log(`[gps51-user-auth] GPS51 login failed: status=${loginData.status}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid GPS51 username or password' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gps51Token = loginData.token;
    const serverId = loginData.serverid;
    console.log(`[gps51-user-auth] GPS51 login successful, token obtained`);

    // Step 3: Determine email for Supabase (GPS51 allows phone or email as username)
    const isEmail = username.includes('@');
    const userEmail = isEmail ? username : `${username}@gps51.local`;
    
    console.log(`[gps51-user-auth] Using email: ${userEmail}`);

    // Step 4: Check if user exists in Supabase or create new
    let userId: string;
    
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error(`[gps51-user-auth] Error listing users:`, listError);
      throw new Error('Failed to check existing users');
    }

    const existingUser = existingUsers.users.find(u => u.email === userEmail);

    if (existingUser) {
      console.log(`[gps51-user-auth] User exists, updating password`);
      userId = existingUser.id;
      
      // Update password to keep in sync
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password
      });
      
      if (updateError) {
        console.error(`[gps51-user-auth] Error updating user:`, updateError);
        throw new Error('Failed to update user credentials');
      }
    } else {
      console.log(`[gps51-user-auth] Creating new user`);
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        password: password,
        email_confirm: true // Auto-confirm since they verified via GPS51
      });
      
      if (createError) {
        console.error(`[gps51-user-auth] Error creating user:`, createError);
        throw new Error('Failed to create user account');
      }
      
      userId = newUser.user.id;
    }

    console.log(`[gps51-user-auth] User ID: ${userId}`);

    // Step 5: Upsert profile
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    let profileId: string;
    
    if (existingProfile) {
      profileId = existingProfile.id;
      console.log(`[gps51-user-auth] Using existing profile: ${profileId}`);
    } else {
      const { data: newProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: userId,
          name: isEmail ? username.split('@')[0] : username,
          email: isEmail ? username : null,
          phone: isEmail ? null : username
        })
        .select('id')
        .single();

      if (profileError) {
        console.error(`[gps51-user-auth] Error creating profile:`, profileError);
        throw new Error('Failed to create user profile');
      }
      
      profileId = newProfile.id;
      console.log(`[gps51-user-auth] Created new profile: ${profileId}`);
    }

    // Step 6: Fetch user's vehicles from GPS51
    const vehiclesPayload = {
      targetUrl: `https://api.gps51.com/openapi?action=querymonitorlist&token=${gps51Token}&serverid=${serverId}`,
      method: 'POST',
      data: {
        username: username
      }
    };

    console.log(`[gps51-user-auth] Fetching vehicles for user`);
    const vehiclesResponse = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vehiclesPayload)
    });

    const vehiclesText = await vehiclesResponse.text();
    console.log(`[gps51-user-auth] Vehicles response: ${vehiclesText.substring(0, 300)}`);

    let vehiclesData;
    try {
      vehiclesData = JSON.parse(vehiclesText);
    } catch (e) {
      console.error(`[gps51-user-auth] Failed to parse vehicles response`);
      await supabaseAdmin.from('gps_api_logs').insert({
        action: 'gps51-user-auth-vehicles',
        request_body: vehiclesPayload,
        response_status: vehiclesResponse.status,
        response_body: { raw: vehiclesText.substring(0, 500) },
        error_message: 'Failed to parse response'
      });
      // Continue anyway - user is authenticated, just no vehicles synced
      return new Response(
        JSON.stringify({ success: true, email: userEmail, vehiclesSynced: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the API call
    await supabaseAdmin.from('gps_api_logs').insert({
      action: 'gps51-user-auth-vehicles',
      request_body: vehiclesPayload,
      response_status: vehiclesResponse.status,
      response_body: vehiclesData
    });

    // Step 7: Sync vehicles and assignments
    let vehiclesSynced = 0;
    const groups = vehiclesData.groups || [];
    
    for (const group of groups) {
      const devices = group.devices || [];
      
      for (const device of devices) {
        const deviceId = device.deviceid?.toString() || device.id?.toString();
        
        if (!deviceId) {
          console.log(`[gps51-user-auth] Skipping device with no ID`);
          continue;
        }

        // Upsert vehicle
        const vehicleData = {
          device_id: deviceId,
          device_name: device.devicename || device.name || `Device ${deviceId}`,
          device_type: device.devicetype || null,
          sim_number: device.simnumber || null,
          gps_owner: username,
          group_id: group.groupid?.toString() || null,
          group_name: group.groupname || null,
          last_synced_at: new Date().toISOString()
        };

        const { error: vehicleError } = await supabaseAdmin
          .from('vehicles')
          .upsert(vehicleData, { onConflict: 'device_id' });

        if (vehicleError) {
          console.error(`[gps51-user-auth] Error upserting vehicle ${deviceId}:`, vehicleError);
          continue;
        }

        // Upsert vehicle assignment
        const assignmentData = {
          device_id: deviceId,
          profile_id: profileId,
          vehicle_alias: device.devicename || device.name || null,
          updated_at: new Date().toISOString()
        };

        const { error: assignError } = await supabaseAdmin
          .from('vehicle_assignments')
          .upsert(assignmentData, { onConflict: 'device_id' });

        if (assignError) {
          console.error(`[gps51-user-auth] Error upserting assignment ${deviceId}:`, assignError);
          continue;
        }

        vehiclesSynced++;
        console.log(`[gps51-user-auth] Synced vehicle: ${deviceId}`);
      }
    }

    console.log(`[gps51-user-auth] Total vehicles synced: ${vehiclesSynced}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        email: userEmail, 
        vehiclesSynced 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error(`[gps51-user-auth] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
