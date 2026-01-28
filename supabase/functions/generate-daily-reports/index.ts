import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Declare Deno for linter
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LLM Helper
async function generateSummary(stats: any, template: any) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) return "Summary unavailable (LLM key missing)."

  const systemPrompt = `You are a helpful fleet assistant. Generate a brief, encouraging daily trip summary for a user based on their vehicle stats.
  Stats: ${JSON.stringify(stats)}
  Keep it under 50 words. Highlight key metrics (distance, duration). Use a friendly tone.`

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: "Generate summary." },
        ],
        max_tokens: 150,
      }),
    })
    
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const data = await response.json()
    return data.choices[0].message.content
  } catch (e) {
    console.error('LLM Error:', e)
    return "Summary unavailable due to error."
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get yesterday's date
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    console.log(`Generating reports for date: ${dateStr}`)

    // 2. Get active template
    const { data: template } = await supabase
      .from('report_templates')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    
    // Default components if no template found
    const enabledComponents = template?.enabled_components || ['summary', 'distance', 'trip_count']
    const includeSummary = enabledComponents.includes('summary')

    // 3. Get eligible users (with positive wallet balance)
    const { data: users, error: userError } = await supabase
      .from('wallets')
      .select('user_id')
      .gt('balance', 0)

    if (userError) throw userError

    console.log(`Found ${users?.length || 0} eligible users`)

    const results = []

    for (const user of users || []) {
        // Check if report already exists
        const { data: existing } = await supabase
            .from('daily_trip_reports')
            .select('id')
            .eq('user_id', user.user_id)
            .eq('report_date', dateStr)
            .maybeSingle()
        
        if (existing) {
            console.log(`Report already exists for user ${user.user_id}, skipping.`)
            continue
        }

        // Get stats
        const { data: stats, error: statsError } = await supabase
            .rpc('get_daily_trip_stats', { 
                p_user_id: user.user_id, 
                p_date: dateStr 
            })
        
        if (statsError) {
            console.error(`Error getting stats for user ${user.user_id}:`, statsError)
            continue
        }

        if (!stats || stats.length === 0) {
             console.log(`No trip activity for user ${user.user_id}`)
             continue
        }
        
        // Aggregate
        const totalDist = stats.reduce((sum: number, s: any) => sum + Number(s.distance_km), 0)
        const totalDur = stats.reduce((sum: number, s: any) => sum + Number(s.duration_seconds), 0)
        const totalTrips = stats.reduce((sum: number, s: any) => sum + Number(s.trip_count), 0)
        const vehicleCount = stats.length

        // Skip if no trips (optional policy)
        if (totalTrips === 0) {
             console.log(`No trips for user ${user.user_id}, skipping report.`)
             continue 
        }

        let summaryText = null
        if (includeSummary) {
            summaryText = await generateSummary({ totalDist, totalDur, totalTrips, vehicleStats: stats }, template)
        }

        // Insert report
        const { error: insertError } = await supabase
            .from('daily_trip_reports')
            .insert({
                user_id: user.user_id,
                report_date: dateStr,
                vehicle_count: vehicleCount,
                total_distance_km: totalDist,
                total_duration_minutes: Math.round(totalDur / 60),
                total_trips: totalTrips,
                summary_text: summaryText,
                metrics: { details: stats },
                email_sent: false
            })
        
        if (insertError) {
             console.error(`Error inserting report for user ${user.user_id}:`, insertError)
        } else {
            console.log(`Created report for user ${user.user_id}`)
            results.push({ user_id: user.user_id, status: 'created' })
        }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error generating reports:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
