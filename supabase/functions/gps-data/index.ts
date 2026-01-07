import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // 1. Parse Frontend Request
    // Expects: { action: "querymonitorlist" } or { action: "lastposition", deviceids: [...] }
    const { action, body_payload } = await req.json()

    // 2. Get Token from DB
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('app_settings')
      .select('value, metadata')
      .eq('key', 'gps_api_token')
      .single()

    if (tokenError || !tokenData) throw new Error('Token not found. Admin login required.')

    const API_TOKEN = tokenData.value
    const USERNAME = tokenData.metadata?.username

    // 3. Prepare Proxy Request
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const BASE_URL = 'https://api.gps51.com/openapi'

    // Construct URL with Token (Crucial for GPS51 API)
    const targetUrl = `${BASE_URL}?action=${action}&token=${API_TOKEN}`

    // Construct Body based on action
    let finalBody = body_payload || {}
    
    // Page 18: 'querymonitorlist' needs 'username' in body
    if (action === 'querymonitorlist') {
      finalBody = { username: USERNAME, ...finalBody }
    }
    
    // Page 12: 'lastposition' needs 'deviceids' (empty list = all devices)
    if (action === 'lastposition' && !finalBody.deviceids) {
      finalBody = { deviceids: [], ...finalBody }
    }

    // 4. Send via Proxy
    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: targetUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: finalBody
      })
    })

    const apiResponse = await proxyRes.json()

    // 5. Handle Token Expiry (Error 9903)
    if (apiResponse.status === 9903) {
      return new Response(
        JSON.stringify({ error: 'Token Expired', status: 9903 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ data: apiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
