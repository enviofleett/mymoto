import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
// MD5 hash helper using Deno std library
async function md5(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("MD5", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

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
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user || user.email !== 'toolbuxdev@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: corsHeaders })
    }

    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const GPS_USER = Deno.env.get('GPS_USERNAME')
    const GPS_PASS_PLAIN = Deno.env.get('GPS_PASSWORD')
    const BASE_URL = 'https://api.gps51.com/openapi'

    if (!DO_PROXY_URL || !GPS_USER || !GPS_PASS_PLAIN) throw new Error('Missing Secrets')

    // System automatically hashes the plain password to MD5
    const passwordHash = await md5(GPS_PASS_PLAIN);

    const proxyPayload = {
      targetUrl: `${BASE_URL}?action=login`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        type: "USER",
        from: "web",
        username: GPS_USER,
        password: passwordHash,
        browser: "Chrome/120.0.0.0"
      }
    }

    const proxyRes = await fetch(DO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload)
    })

    const apiResponse = await proxyRes.json()

    if (apiResponse.status !== 0 || !apiResponse.token) {
      throw new Error(`GPS Login Failed: ${JSON.stringify(apiResponse)}`)
    }

    await supabaseClient.from('app_settings').upsert({ 
      key: 'gps_token', 
      value: apiResponse.token,
      metadata: { serverid: apiResponse.serverid, username: GPS_USER, updated_at: new Date().toISOString() }
    }, { onConflict: 'key' })

    return new Response(JSON.stringify({ success: true, data: apiResponse }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
