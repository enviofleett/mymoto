import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { email, password, name, phone, deviceIds } = await req.json();

    console.log('Creating user:', { email, name, phone, deviceIds, hasPassword: !!password });

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If password is provided, email is required
    if (password && !email) {
      return new Response(
        JSON.stringify({ error: 'Email is required when password is provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId: string | null = null;

    // 1. Create auth user using admin API (only if password provided)
    if (password && email) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email for admin-created users
        user_metadata: {
          name,
          phone
        }
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        return new Response(
          JSON.stringify({ error: `Failed to create auth user: ${authError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
      console.log('Created auth user with ID:', userId);
    } else if (email && !password) {
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users.find(u => u.email === email);
      if (existingUser) {
        userId = existingUser.id;
        console.log('Using existing auth user:', userId);
      }
    }

    // 2. Create profile linked to auth user (if exists)
    const profileDataToInsert = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      user_id: userId
    };

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert(profileDataToInsert)
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Cleanup: delete the auth user if profile creation fails and we created one
      if (userId) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(err => 
          console.error('Error cleaning up auth user:', err)
        );
      }
      return new Response(
        JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created profile with ID:', profileData.id);

    // 3. Assign user role as 'owner' (only if auth user was created)
    if (userId) {
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'owner'
        });

      if (roleError) {
        console.error('Error assigning role:', roleError);
        // Non-fatal, continue
      }
    }

    // 4. Assign vehicles if provided
    let assignedVehicles: string[] = [];
    if (deviceIds && deviceIds.length > 0) {
      // Verify vehicles exist before assigning
      const { data: vehicleDetails, error: vehicleCheckError } = await supabaseAdmin
        .from('vehicles')
        .select('device_id, device_name')
        .in('device_id', deviceIds);

      if (vehicleCheckError) {
        console.error('Error checking vehicles:', vehicleCheckError);
        // Continue but log warning
      }

      // Only assign vehicles that exist in the database
      const existingDeviceIds = vehicleDetails?.map(v => v.device_id) || [];
      const missingDevices = deviceIds.filter(id => !existingDeviceIds.includes(id));
      
      if (missingDevices.length > 0) {
        console.warn('Some vehicles do not exist in database:', missingDevices);
      }

      if (existingDeviceIds.length > 0) {
        const assignments = existingDeviceIds.map((deviceId: string) => {
          const vehicle = vehicleDetails?.find(v => v.device_id === deviceId);
          return {
            device_id: deviceId,
            profile_id: profileData.id,
            vehicle_alias: vehicle?.device_name || null
          };
        });

        const { data: assignmentData, error: assignError } = await supabaseAdmin
          .from('vehicle_assignments')
          .insert(assignments)
          .select();

        if (assignError) {
          console.error('Error assigning vehicles:', assignError);
          // Check if it's a composite key conflict (already assigned)
          if (assignError.code === '23505') {
            console.log('Some vehicles already assigned, continuing...');
          }
        } else {
          assignedVehicles = assignmentData?.map(a => a.device_id) || [];
          console.log('Assigned vehicles:', assignedVehicles);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        profileId: profileData.id,
        assignedVehicles,
        user: {
          id: userId,
          email,
          name: profileData.name
        },
        profile: {
          id: profileData.id,
          name: profileData.name
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
