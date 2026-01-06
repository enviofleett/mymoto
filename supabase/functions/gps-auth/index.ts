import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_EMAIL = 'toolbuxdev@gmail.com';

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

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    
    // Create client with user's token to verify identity
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !user) {
      console.error('User verification failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid user' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user email matches allowed email
    if (user.email !== ALLOWED_EMAIL) {
      console.error(`Access denied for email: ${user.email}`);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Access restricted to authorized users only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authorized user: ${user.email}`);

    // Get environment variables
    const gpsUsername = Deno.env.get('GPS_USERNAME');
    const gpsPassword = Deno.env.get('GPS_PASSWORD');
    const doProxyUrl = Deno.env.get('DO_PROXY_URL');

    if (!gpsUsername || !gpsPassword || !doProxyUrl) {
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Making request to GPS login endpoint via proxy...');

    // Make request to GPS login endpoint via Digital Ocean proxy
    const proxyResponse = await fetch(doProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: 'https://app.gpstrack.co.za/api/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {
          username: gpsUsername,
          password: gpsPassword
        }
      })
    });

    if (!proxyResponse.ok) {
      const errorText = await proxyResponse.text();
      console.error('Proxy request failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with GPS service', details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const proxyData = await proxyResponse.json();
    console.log('GPS login response received');

    // Extract token from response
    const token = proxyData.data?.token || proxyData.data?.access_token || proxyData.token;
    
    if (!token) {
      console.error('No token in GPS response:', JSON.stringify(proxyData));
      return new Response(
        JSON.stringify({ error: 'No token received from GPS service', response: proxyData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token received, upserting to database...');

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert token into app_settings table
    const { error: upsertError } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        {
          key: 'gps_token',
          value: token,
          metadata: {
            refreshed_by: user.email,
            refreshed_at: new Date().toISOString(),
            expires_at: proxyData.data?.expires_at || null
          }
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      console.error('Failed to save token:', upsertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to save token', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token saved successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'GPS token refreshed successfully',
        refreshed_at: new Date().toISOString()
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
