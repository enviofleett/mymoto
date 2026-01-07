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

    // Get Token
    const { data: tokenData } = await supabaseClient
      .from('app_settings')
      .select('value, metadata')
      .eq('key', 'gps_token')
      .single()

    if (!tokenData) throw new Error('Token not found. Admin login required.')

    const API_TOKEN = tokenData.value
    const USERNAME = tokenData.metadata?.username
    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    if (!DO_PROXY_URL) throw new Error('Missing DO_PROXY_URL secret')
    const BASE_URL = 'https://api.gps51.com/openapi'

    // Parse Request
    const { action, body_payload } = await req.json()

    // Build Body
    let finalBody = body_payload || {}
    if (action === 'querymonitorlist') finalBody = { username: USERNAME, ...finalBody }
    if (action === 'lastposition' && !finalBody.deviceids) finalBody = { deviceids: [], ...finalBody }

    // Call Proxy (Token in URL)
    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `${BASE_URL}?action=${action}&token=${API_TOKEN}`,
        method: 'POST',
        data: finalBody
      })
    })

    const apiResponse = await proxyRes.json()

    return new Response(JSON.stringify({ data: apiResponse }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
