import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    console.log('Creating test user:', { email, name, phone, deviceIds });

    // Validate required fields
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Create auth user using admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for test users
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

    const userId = authData.user.id;
    console.log('Created auth user with ID:', userId);

    // 2. Create profile linked to auth user
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        name: name || email.split('@')[0],
        email,
        phone,
        user_id: userId
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Cleanup: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created profile with ID:', profileData.id);

    // 3. Assign user role as 'owner'
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

    // 4. Assign vehicles if provided
    let assignedVehicles: string[] = [];
    if (deviceIds && deviceIds.length > 0) {
      // Get vehicle details for aliases
      const { data: vehicleDetails } = await supabaseAdmin
        .from('vehicles')
        .select('device_id, plate')
        .in('device_id', deviceIds);

      const assignments = deviceIds.map((deviceId: string) => {
        const vehicle = vehicleDetails?.find(v => v.device_id === deviceId);
        return {
          device_id: deviceId,
          profile_id: profileData.id,
          vehicle_alias: vehicle?.plate || null
        };
      });

      const { data: assignmentData, error: assignError } = await supabaseAdmin
        .from('vehicle_assignments')
        .insert(assignments)
        .select();

      if (assignError) {
        console.error('Error assigning vehicles:', assignError);
      } else {
        assignedVehicles = assignmentData?.map(a => a.device_id) || [];
        console.log('Assigned vehicles:', assignedVehicles);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email,
          name: profileData.name
        },
        profile: {
          id: profileData.id,
          name: profileData.name
        },
        assignedVehicles
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
