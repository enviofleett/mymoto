import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { callGps51LoginWithRateLimit } from "../_shared/gps51-client.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_VALIDITY_HOURS = 24

async function md5(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("MD5", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Verify admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user || user.email !== 'toolbuxdev@gmail.com') {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const DO_PROXY_URL = Deno.env.get('DO_PROXY_URL')
    const GPS_USER = Deno.env.get('GPS_USERNAME')
    const GPS_PASS_PLAIN = Deno.env.get('GPS_PASSWORD')

    if (!DO_PROXY_URL || !GPS_USER || !GPS_PASS_PLAIN) {
      throw new Error('Missing required secrets (DO_PROXY_URL, GPS_USERNAME, GPS_PASSWORD)')
    }

    console.log('Starting GPS51 token refresh for user:', GPS_USER)

    // Hash password
    const passwordHash = await md5(GPS_PASS_PLAIN)

    // Call GPS51 login with centralized rate limiting
    const startTime = Date.now()
    const loginData = {
      type: "USER",
      from: "web",
      username: GPS_USER,
      password: passwordHash,
      browser: "Chrome/120.0.0.0"
    }

    let apiResponse
    try {
      apiResponse = await callGps51LoginWithRateLimit(supabase, DO_PROXY_URL, loginData)
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Log the failed login attempt
      await supabase.from('gps_api_logs').insert({
        action: 'login',
        request_body: { username: GPS_USER },
        response_status: 0,
        response_body: { error: error instanceof Error ? error.message : 'Unknown error' },
        error_message: error instanceof Error ? error.message : 'Login failed',
        duration_ms: duration
      }).catch(err => console.error('Failed to log error:', err))
      
      // Handle rate limit errors gracefully
      if (error instanceof Error && error.message.includes('rate limit')) {
        throw error // Re-throw rate limit errors with clear message
      }
      throw new Error(`GPS51 login failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    const duration = Date.now() - startTime
    console.log(`GPS51 login took ${duration}ms`)

    // Log the login attempt
    await supabase.from('gps_api_logs').insert({
      action: 'login',
      request_body: { username: GPS_USER },
      response_status: apiResponse.status ?? 0,
      response_body: { ...apiResponse, token: apiResponse.token ? '***' : null },
      error_message: apiResponse.status !== 0 ? `Login failed with status ${apiResponse.status}` : null,
      duration_ms: duration
    }).catch(err => console.error('Failed to log API call:', err))

    if (apiResponse.status !== 0 || !apiResponse.token) {
      throw new Error(`GPS51 Login Failed: status=${apiResponse.status}, message=${apiResponse.message || 'Unknown'}`)
    }

    // Calculate expiry (24 hours from now, minus 1 hour buffer)
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + TOKEN_VALIDITY_HOURS - 1)

    // Store token with expiry
    await supabase.from('app_settings').upsert({ 
      key: 'gps_token', 
      value: apiResponse.token,
      expires_at: expiresAt.toISOString(),
      metadata: { 
        serverid: apiResponse.serverid, 
        username: GPS_USER, 
        refreshed_by: user.email,
        refreshed_at: new Date().toISOString()
      }
    }, { onConflict: 'key' })

    console.log(`Token refreshed successfully, expires at ${expiresAt.toISOString()}`)

    return new Response(JSON.stringify({ 
      success: true, 
      expires_at: expiresAt.toISOString(),
      serverid: apiResponse.serverid
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('GPS Auth Error:', message)
    
    return new Response(JSON.stringify({ error: message }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
