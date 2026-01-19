import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse request
    const url = new URL(req.url)
    const deviceId = url.searchParams.get('device_id')
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')

    // Validate device_id
    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: 'device_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Set default date range (last 30 days if not provided)
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const end = endDate || new Date().toISOString().split('T')[0]

    console.log(`[daily-travel-stats] Fetching stats for device=${deviceId}, start=${start}, end=${end}`)

    // Call the database function
    const { data, error } = await supabase.rpc('get_daily_travel_stats', {
      p_device_id: deviceId,
      p_start_date: start,
      p_end_date: end
    })

    if (error) {
      console.error('[daily-travel-stats] Database error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Format response
    const result = {
      device_id: deviceId,
      date_range: {
        start: start,
        end: end
      },
      time_window: {
        start: '07:00',
        end: '18:00',
        timezone: 'Africa/Lagos'
      },
      daily_stats: data || [],
      summary: {
        total_days: data?.length || 0,
        total_distance_km: data?.reduce((sum: number, day: any) => sum + (parseFloat(day.total_distance_km) || 0), 0).toFixed(2) || '0.00',
        total_travel_time_minutes: data?.reduce((sum: number, day: any) => sum + (parseFloat(day.total_travel_time_minutes) || 0), 0).toFixed(2) || '0.00',
        total_trips: data?.reduce((sum: number, day: any) => sum + (parseInt(day.trip_count) || 0), 0) || 0
      }
    }

    console.log(`[daily-travel-stats] Success: ${result.daily_stats.length} days of data`)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[daily-travel-stats] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
