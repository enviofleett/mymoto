import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { md5 } from 'https://esm.sh/js-md5@0.8.3'

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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    // Check if user is Admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user || user.email !== 'toolbuxdev@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: corsHeaders })
    }

    // Configuration
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const GPS_USER = Deno.env.get('GPS_USERNAME')
    const GPS_PASS_PLAIN = Deno.env.get('GPS_PASSWORD') // Plain text from secrets
    const BASE_URL = 'https://api.gps51.com/openapi'   // Correct URL

    // Hash Password
    const passwordHash = md5(GPS_PASS_PLAIN);

    // Call API via Proxy
    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${BASE_URL}?action=login`,
        method: 'POST',
        data: {
          type: "USER",
          from: "web",
          username: GPS_USER,
          password: passwordHash, // Send Hashed Password
          browser: "Chrome/120.0.0.0"
        }
      })
    })

    const apiResponse = await proxyRes.json()

    // Validate (Status 0 is success per PDF)
    if (apiResponse.status !== 0 || !apiResponse.token) {
      throw new Error(`GPS Login Failed: ${JSON.stringify(apiResponse)}`)
    }

    // Save Token
    await supabaseClient.from('app_settings').upsert({ 
      key: 'gps_token', 
      value: apiResponse.token,
      metadata: { serverid: apiResponse.serverid, username: GPS_USER, updated_at: new Date().toISOString() }
    }, { onConflict: 'key' })

    return new Response(JSON.stringify({ success: true, data: apiResponse }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
