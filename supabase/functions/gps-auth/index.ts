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
    // Verify admin user (or allow internal service-role calls).
    // Note: This function uses service role to write app_settings, so we must strictly gate access.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Internal calls can use the service role key directly.
    let triggeredBy = 'internal_service_role'
    if (!serviceRoleKey || token !== serviceRoleKey) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: adminRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle()

      if (roleError || !adminRole) {
        return new Response(JSON.stringify({ error: 'Forbidden - Admin only' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      triggeredBy = user.email ?? user.id
    }

    console.log('Starting GPS51 token refresh triggered by:', triggeredBy)

    const result = await refreshGps51Token(supabase, triggeredBy);

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
