import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refreshGps51Token } from "../_shared/gps51-client.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log('Starting GPS51 token refresh triggered by admin:', user.email)

    const result = await refreshGps51Token(supabase, user.email);

    // Calculate expiry (24 hours from now, minus 1 hour buffer) - matching shared logic
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 23)

    return new Response(JSON.stringify({ 
      success: true, 
      expires_at: expiresAt.toISOString(),
      serverid: result.serverid
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
