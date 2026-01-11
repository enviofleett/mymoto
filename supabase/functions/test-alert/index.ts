import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const { event_type = 'overspeeding', severity = 'critical' } = await req.json().catch(() => ({}))

    // Get a real device_id
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('device_id, device_name')
      .limit(1)
      .single()

    if (!vehicle) {
      throw new Error('No vehicles found')
    }

    const testEvents: Record<string, { title: string; message: string; metadata: Record<string, unknown> }> = {
      overspeeding: {
        title: '🚨 TEST: High Speed Alert',
        message: `Vehicle ${vehicle.device_name} traveling at 145 km/h - TEST EVENT`,
        metadata: { speed: 145, lat: -1.2921, lon: 36.8219, test: true }
      },
      critical_battery: {
        title: '🔋 TEST: Critical Battery',
        message: `Vehicle ${vehicle.device_name} battery at 5% - TEST EVENT`,
        metadata: { battery: 5, test: true }
      },
      low_battery: {
        title: '🔋 TEST: Low Battery Warning',
        message: `Vehicle ${vehicle.device_name} battery at 15% - TEST EVENT`,
        metadata: { battery: 15, test: true }
      }
    }

    const eventData = testEvents[event_type] || testEvents.overspeeding

    const { data, error } = await supabase
      .from('proactive_vehicle_events')
      .insert({
        device_id: vehicle.device_id,
        event_type,
        severity,
        title: eventData.title,
        message: eventData.message,
        metadata: { ...eventData.metadata, detected_by: 'test-alert' }
      })
      .select()
      .single()

    if (error) throw error

    console.log('Test alert inserted:', data)

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Test ${severity} ${event_type} alert created for ${vehicle.device_name}`,
      event: data
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Test alert error:', message)
    
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
