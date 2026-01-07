import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Setup Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Auth Check (Admin Only)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user || user.email !== 'toolbuxdev@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: corsHeaders })
    }

    // 3. Get Credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const GPS_USER = Deno.env.get('GPS_USERNAME')
    const GPS_PASS_MD5 = Deno.env.get('GPS_PASSWORD') // MUST BE SAVED AS MD5 HASH IN SECRETS
    const BASE_URL = 'https://api.gps51.com/openapi'

    if (!DO_PROXY_URL || !GPS_USER || !GPS_PASS_MD5) throw new Error('Missing Secrets')

    // 4. Construct Request (Per Page 1 & 2 of PDF)
    // URL: https://api.gps51.com/openapi?action=login
    const proxyPayload = {
      targetUrl: `${BASE_URL}?action=login`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        type: "USER",
        from: "web",
        username: GPS_USER,
        password: GPS_PASS_MD5, // Sending MD5 hash directly
        browser: "Chrome/120.0.0.0" 
      }
    }

    // 5. Execute via Proxy
    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload)
    })

    const apiResponse = await proxyRes.json()

    // 6. Handle API Response (Page 2: status 0 = Success)
    if (apiResponse.status !== 0 || !apiResponse.token) {
      console.error('GPS Login Failed:', apiResponse)
      throw new Error(`GPS API Error: ${apiResponse.cause || 'Unknown'}`)
    }

    // 7. Save to Database
    const { error: dbError } = await supabaseClient
      .from('app_settings')
      .upsert({ 
        key: 'gps_api_token', // Consistency: match this key in gps-data
        value: apiResponse.token,
        metadata: { 
          serverid: apiResponse.serverid,
          username: GPS_USER,
          updated_at: new Date().toISOString()
        }
      }, { onConflict: 'key' })

    if (dbError) throw dbError

    return new Response(
      JSON.stringify({ success: true, message: 'Token Refreshed', data: apiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
