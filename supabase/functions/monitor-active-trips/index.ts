/**
 * Trip Duration Variance Alerts Edge Function
 * Phase 2.6: Monitors active trips and alerts if taking 25% longer than expected
 * 
 * Cron Schedule: Every 5 minutes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adjustSeverityByTimeOfDay } from "../_shared/alert-severity.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find active trips (ignition on, moving, but no end_time in vehicle_trips)
    const { data: activePositions, error: positionsError } = await supabase
      .from('vehicle_positions')
      .select('device_id, ignition_on, speed, latitude, longitude, gps_time')
      .eq('ignition_on', true)
      .gt('speed', 5) // Moving faster than 5 km/h
      .limit(1000);

    if (positionsError) {
      throw new Error(`Failed to fetch active positions: ${positionsError.message}`);
    }

    if (!activePositions || activePositions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active trips to monitor', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let alertsCreated = 0;

    for (const position of activePositions) {
      try {
        // Find the most recent trip start for this vehicle
        const { data: recentTrips, error: tripsError } = await supabase
          .from('vehicle_trips')
          .select('id, start_time, start_latitude, start_longitude, end_time')
          .eq('device_id', position.device_id)
          .is('end_time', null) // Active trip
          .order('start_time', { ascending: false })
          .limit(1);

        if (tripsError || !recentTrips || recentTrips.length === 0) {
          continue; // No active trip found
        }

        const activeTrip = recentTrips[0];
        const tripStartTime = new Date(activeTrip.start_time);
        const currentTime = new Date();
        const tripDurationMinutes = (currentTime.getTime() - tripStartTime.getTime()) / (1000 * 60);

        // Find similar historical trips (same origin, same day of week, same hour)
        const tripStart = new Date(activeTrip.start_time);
        const dayOfWeek = tripStart.getDay();
        const hourOfDay = tripStart.getHours();

        // Get trip patterns for this route
        const { data: patterns, error: patternsError } = await supabase
          .rpc('get_trip_patterns', {
            p_device_id: position.device_id,
            p_day_of_week: dayOfWeek,
            p_hour_of_day: hourOfDay,
            p_current_lat: activeTrip.start_latitude,
            p_current_lon: activeTrip.start_longitude,
          });

        if (patternsError || !patterns || patterns.length === 0) {
          continue; // No patterns to compare against
        }

        // Find matching pattern (same origin)
        const matchingPattern = patterns.find(p => 
          Math.abs(p.origin_latitude - (activeTrip.start_latitude || 0)) < 0.001 &&
          Math.abs(p.origin_longitude - (activeTrip.start_longitude || 0)) < 0.001
        );

        if (!matchingPattern || !matchingPattern.avg_duration_minutes) {
          continue; // No matching pattern
        }

        const expectedDuration = matchingPattern.avg_duration_minutes;
        const durationVariance = ((tripDurationMinutes - expectedDuration) / expectedDuration) * 100;

        // Alert if trip is 25% longer than expected
        if (durationVariance > 25 && tripDurationMinutes > 10) { // Only alert for trips longer than 10 minutes
          // Check if alert already sent for this trip
          const { data: existingAlert } = await supabase
            .from('proactive_vehicle_events')
            .select('id')
            .eq('device_id', position.device_id)
            .eq('event_type', 'trip_duration_variance')
            .gte('created_at', tripStartTime.toISOString())
            .limit(1);

          if (existingAlert && existingAlert.length > 0) {
            continue; // Already alerted for this trip
          }

          const { severity } = adjustSeverityByTimeOfDay('info', 'trip_duration_variance', 'Africa/Lagos');

          await supabase.from('proactive_vehicle_events').insert({
            device_id: position.device_id,
            event_type: 'trip_duration_variance',
            severity: severity,
            title: 'Trip Taking Longer Than Usual',
            message: `Current trip is ${durationVariance.toFixed(0)}% longer than usual. Expected: ${expectedDuration.toFixed(0)} min, Current: ${tripDurationMinutes.toFixed(0)} min.`,
            metadata: {
              trip_id: activeTrip.id,
              expected_duration_minutes: expectedDuration,
              current_duration_minutes: tripDurationMinutes,
              variance_percent: durationVariance,
            },
            latitude: position.latitude,
            longitude: position.longitude,
            notified: false,
          });

          alertsCreated++;
        }

      } catch (error) {
        console.error(`[monitor-active-trips] Error processing ${position.device_id}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Active trips monitored',
        active_trips_checked: activePositions.length,
        alerts_created: alertsCreated,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[monitor-active-trips] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
