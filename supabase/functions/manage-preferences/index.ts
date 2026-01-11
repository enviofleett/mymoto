import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Manage User Preferences Edge Function
 * 
 * Allows users to view, update, and reset their learned preferences.
 * 
 * Actions:
 * - list: Get all preferences for the user
 * - update: Update a specific preference
 * - delete: Delete a specific preference
 * - reset: Delete all preferences for the user
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, preference_key, preference_value, user_id } = await req.json()

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    switch (action) {
      case 'list': {
        const { data: preferences, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user_id)
          .order('confidence_score', { ascending: false })

        if (error) throw error

        // Group preferences by category
        const grouped = preferences.reduce((acc: Record<string, any[]>, pref) => {
          const category = pref.preference_key.split('_')[0] || 'other'
          if (!acc[category]) acc[category] = []
          acc[category].push({
            key: pref.preference_key,
            value: pref.preference_value,
            confidence: pref.confidence_score,
            source: pref.source,
            lastUpdated: pref.last_updated
          })
          return acc
        }, {})

        return new Response(JSON.stringify({
          success: true,
          total: preferences.length,
          preferences: grouped,
          raw: preferences
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'update': {
        if (!preference_key) {
          return new Response(JSON.stringify({ error: 'preference_key is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { data: existing } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user_id)
          .eq('preference_key', preference_key)
          .maybeSingle()

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('user_preferences')
            .update({
              preference_value: preference_value,
              confidence_score: 1.0, // Explicit updates have max confidence
              source: 'explicit',
              last_updated: new Date().toISOString()
            })
            .eq('id', existing.id)

          if (error) throw error
        } else {
          // Insert new
          const { error } = await supabase
            .from('user_preferences')
            .insert({
              user_id,
              preference_key,
              preference_value,
              confidence_score: 1.0,
              source: 'explicit'
            })

          if (error) throw error
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Preference '${preference_key}' updated successfully`,
          action: existing ? 'updated' : 'created'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'delete': {
        if (!preference_key) {
          return new Response(JSON.stringify({ error: 'preference_key is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const { error, count } = await supabase
          .from('user_preferences')
          .delete()
          .eq('user_id', user_id)
          .eq('preference_key', preference_key)

        if (error) throw error

        return new Response(JSON.stringify({
          success: true,
          message: `Preference '${preference_key}' deleted`,
          deleted: count || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'reset': {
        const { error, count } = await supabase
          .from('user_preferences')
          .delete()
          .eq('user_id', user_id)

        if (error) throw error

        return new Response(JSON.stringify({
          success: true,
          message: 'All preferences reset',
          deleted: count || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      default:
        return new Response(JSON.stringify({
          error: 'Invalid action. Use: list, update, delete, reset'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Preference management error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
