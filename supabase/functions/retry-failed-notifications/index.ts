/**
 * Retry Failed Notifications Edge Function
 * 
 * This function retries failed proactive-alarm-to-chat and proactive-alarm-to-push calls.
 * Should be called periodically via cron job or manually.
 * 
 * Usage:
 * - Manual: POST /functions/v1/retry-failed-notifications
 * - Cron: Set up in Supabase Dashboard to run every 15 minutes
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const retryOneFunction = async (
      functionName: 'proactive-alarm-to-chat' | 'proactive-alarm-to-push',
      opts: { onlyNotifiedFalse?: boolean }
    ) => {
      const { data: failedEvents, error: fetchError } = await supabase.rpc('get_failed_events_for_retry', {
        p_function_name: functionName,
        p_max_retries: 3,
        p_max_age_hours: 24,
      });

      if (fetchError) throw fetchError;
      if (!failedEvents || failedEvents.length === 0) {
        return { attempted: 0, successful: 0, failed: 0 };
      }

      const eventIds = failedEvents.map((e: any) => e.event_id).filter(Boolean);
      if (eventIds.length === 0) {
        // Resolve empty references.
        for (const e of failedEvents) {
          if (e.error_id) await supabase.rpc('mark_error_resolved', { p_error_id: e.error_id });
        }
        return { attempted: 0, successful: 0, failed: 0 };
      }

      let q = supabase.from('proactive_vehicle_events').select('*').in('id', eventIds);
      if (opts.onlyNotifiedFalse) q = q.eq('notified', false);

      const { data: events, error: eventsError } = await q;
      if (eventsError) throw eventsError;

      if (!events || events.length === 0) {
        // Mark all as resolved since events are already handled or don't exist.
        for (const e of failedEvents) {
          if (e.error_id) await supabase.rpc('mark_error_resolved', { p_error_id: e.error_id });
        }
        return { attempted: 0, successful: 0, failed: 0 };
      }

      const results = await Promise.allSettled(
        events.map(async (event: any) => {
          const errorRecord = failedEvents.find((e: any) => e.event_id === event.id);
          if (errorRecord?.error_id) {
            await supabase.rpc('increment_retry_count', { p_error_id: errorRecord.error_id });
          }

          const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
              event: {
                id: event.id,
                device_id: event.device_id,
                event_type: event.event_type,
                severity: event.severity,
                title: event.title,
                message: event.message || event.title || '',
                description: event.description,
                metadata: event.metadata || {},
                latitude: event.latitude,
                longitude: event.longitude,
                location_name: event.location_name,
                created_at: event.created_at,
              },
            },
          });

          if (error) throw error;
          if (errorRecord?.error_id && data?.success) {
            await supabase.rpc('mark_error_resolved', { p_error_id: errorRecord.error_id });
          }

          return { event_id: event.id, success: data?.success || false };
        })
      );

      const successful = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.success).length;
      const failed = results.filter((r) => r.status === 'rejected' || !(r.value as any)?.success).length;
      return { attempted: events.length, successful, failed };
    };

    const chat = await retryOneFunction('proactive-alarm-to-chat', { onlyNotifiedFalse: true });
    const push = await retryOneFunction('proactive-alarm-to-push', { onlyNotifiedFalse: false });

    return new Response(
      JSON.stringify({
        success: true,
        chat,
        push,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[retry-failed-notifications] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
