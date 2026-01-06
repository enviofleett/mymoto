import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { user_id } = await req.json();
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching GPS data for user_id: ${user_id}`);

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    
    // Verify user with their token
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !user) {
      console.error('User verification failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid user' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Request from authenticated user: ${user.email}`);

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Retrieve token from app_settings
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('app_settings')
      .select('value, metadata, updated_at')
      .eq('key', 'gps_token')
      .maybeSingle();

    if (tokenError) {
      console.error('Failed to retrieve token:', tokenError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve GPS token', details: tokenError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData || !tokenData.value) {
      console.error('No GPS token found in database');
      return new Response(
        JSON.stringify({ error: 'GPS token not found. Please refresh the token first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gpsToken = tokenData.value;
    console.log('Token retrieved, fetching vehicle data...');

    // Get proxy URL
    const doProxyUrl = Deno.env.get('DO_PROXY_URL');
    
    if (!doProxyUrl) {
      console.error('Missing DO_PROXY_URL environment variable');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing proxy URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Make request to GPS API via proxy
    const proxyResponse = await fetch(doProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `https://app.gpstrack.co.za/api/vehicles?user_id=${user_id}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${gpsToken}`,
          'Content-Type': 'application/json'
        }
      })
    });

    if (!proxyResponse.ok) {
      const errorText = await proxyResponse.text();
      console.error('Proxy request failed:', errorText);
      
      // Check if token expired
      if (proxyResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'GPS token expired. Please refresh the token.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to fetch vehicle data', details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vehicleData = await proxyResponse.json();
    console.log('Vehicle data received successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: vehicleData.data || vehicleData,
        token_updated_at: tokenData.updated_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Unexpected error:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
