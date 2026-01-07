import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { md5 } from 'https://esm.sh/js-md5@0.8.3' // 1. Added MD5 Library

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user || user.email !== 'toolbuxdev@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access only' }), { status: 403, headers: corsHeaders })
    }

    // 3. Get Credentials
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const GPS_USER = Deno.env.get('GPS_USERNAME')
    const GPS_PASS_PLAIN = Deno.env.get('GPS_PASSWORD') // Read PLAIN password
    const BASE_URL = 'https://api.gps51.com/openapi'

    if (!DO_PROXY_URL || !GPS_USER || !GPS_PASS_PLAIN) throw new Error('Missing Secrets')

    // 4. Auto-Hash Password
    const passwordHash = md5(GPS_PASS_PLAIN); // System handles hashing now

    // 5. Construct Payload
    const proxyPayload = {
      targetUrl: `${BASE_URL}?action=login`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        type: "USER",
        from: "web",
        username: GPS_USER,
        password: passwordHash, // Sending the generated hash
        browser: "Chrome/120.0.0.0"
      }
    }

    // 6. Execute via Proxy
    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload)
    })

    const apiResponse = await proxyRes.json()

    if (apiResponse.status !== 0 || !apiResponse.token) {
      throw new Error(`GPS Login Failed: ${apiResponse.cause || JSON.stringify(apiResponse)}`)
    }

    // 7. Save Token (FIXED KEY)
    const { error: dbError } = await supabaseClient
      .from('app_settings')
      .upsert({ 
        key: 'gps_token', // FIXED: Matches 'gps_token' in your gps-data function
        value: apiResponse.token,
        metadata: { 
          serverid: apiResponse.serverid,
          username: GPS_USER,
          updated_at: new Date().toISOString()
        }
      }, { onConflict: 'key' })

    if (dbError) throw dbError

    return new Response(
      JSON.stringify({ success: true, message: 'Token Refreshed & Hashed Automatically', data: apiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
