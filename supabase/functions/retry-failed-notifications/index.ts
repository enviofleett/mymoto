/**
 * Retry Failed Notifications Edge Function
 * 
 * This function retries failed proactive-alarm-to-chat calls.
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

    // Get failed events that need retry
    const { data: failedEvents, error: fetchError } = await supabase
      .rpc('get_failed_events_for_retry', {
        p_function_name: 'proactive-alarm-to-chat',
        p_max_retries: 3,
        p_max_age_hours: 24,
      });

    if (fetchError) {
      console.error('[retry-failed-notifications] Error fetching failed events:', fetchError);
      throw fetchError;
    }

    if (!failedEvents || failedEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No failed events to retry',
          retried: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[retry-failed-notifications] Found ${failedEvents.length} failed events to retry`);

    // Get the original events from proactive_vehicle_events
    const eventIds = failedEvents.map((e: any) => e.event_id).filter(Boolean);
    
    if (eventIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No valid event IDs found',
          retried: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: events, error: eventsError } = await supabase
      .from('proactive_vehicle_events')
      .select('*')
      .in('id', eventIds)
      .eq('notified', false); // Only retry events that haven't been notified

    if (eventsError) {
      console.error('[retry-failed-notifications] Error fetching events:', eventsError);
      throw eventsError;
    }

    if (!events || events.length === 0) {
      // Mark all as resolved since events are already notified or don't exist
      const errorIds = failedEvents.map((e: any) => e.error_id);
      for (const errorId of errorIds) {
        await supabase.rpc('mark_error_resolved', { p_error_id: errorId });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'All events already notified or not found',
          retried: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[retry-failed-notifications] Retrying ${events.length} events`);

    // Retry each event by calling the proactive-alarm-to-chat function
    const retryResults = await Promise.allSettled(
      events.map(async (event) => {
        const errorRecord = failedEvents.find((e: any) => e.event_id === event.id);
        
        // Increment retry count
        if (errorRecord) {
          await supabase.rpc('increment_retry_count', { p_error_id: errorRecord.error_id });
        }

        // Call the proactive-alarm-to-chat function
        const { data, error } = await supabase.functions.invoke('proactive-alarm-to-chat', {
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

        if (error) {
          throw error;
        }

        // Mark as resolved if successful
        if (errorRecord && data?.success) {
          await supabase.rpc('mark_error_resolved', { p_error_id: errorRecord.error_id });
        }

        return { event_id: event.id, success: data?.success || false };
      })
    );

    const successful = retryResults.filter((r) => r.status === 'fulfilled' && (r.value as any)?.success).length;
    const failed = retryResults.filter((r) => r.status === 'rejected' || !(r.value as any)?.success).length;

    console.log(`[retry-failed-notifications] Retry complete: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Retried ${successful} events successfully`,
        retried: successful,
        failed: failed,
        total: events.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
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
