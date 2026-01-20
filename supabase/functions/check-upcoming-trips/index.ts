/**
 * Proactive Trip Start Alerts Edge Function
 * Phase 2.1: Analyzes trip patterns and sends proactive alerts 15 minutes before typical trip time
 * 
 * Cron Schedule: Every hour at :45 (e.g., 7:45, 8:45)
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

    // Get current time in Lagos timezone
    const now = new Date();
    const lagosTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    const currentHour = lagosTime.getHours();
    const currentDayOfWeek = lagosTime.getDay(); // 0=Sunday, 6=Saturday
    const nextHour = (currentHour + 1) % 24;

    console.log(`[check-upcoming-trips] Checking for trips starting at ${nextHour}:00 on day ${currentDayOfWeek}`);

    // Get all active vehicles with assignments
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicle_assignments')
      .select('device_id')
      .limit(1000); // Process up to 1000 vehicles

    if (vehiclesError) {
      throw new Error(`Failed to fetch vehicles: ${vehiclesError.message}`);
    }

    if (!vehicles || vehicles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No vehicles to check', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const deviceIds = [...new Set(vehicles.map(v => v.device_id))];
    let alertsCreated = 0;

    // Check each vehicle for upcoming trips
    for (const deviceId of deviceIds) {
      try {
        // Get current vehicle position
        const { data: position } = await supabase
          .from('vehicle_positions')
          .select('latitude, longitude')
          .eq('device_id', deviceId)
          .single();

        // Get trip patterns for next hour
        const { data: patterns, error: patternsError } = await supabase
          .rpc('get_trip_patterns', {
            p_device_id: deviceId,
            p_day_of_week: currentDayOfWeek,
            p_hour_of_day: nextHour,
            p_current_lat: position?.latitude || null,
            p_current_lon: position?.longitude || null,
          });

        if (patternsError) {
          console.error(`[check-upcoming-trips] Error fetching patterns for ${deviceId}:`, patternsError);
          continue;
        }

        if (!patterns || patterns.length === 0) {
          continue; // No patterns for this vehicle at this time
        }

        // Check if we're 15 minutes before the trip time
        const currentMinute = lagosTime.getMinutes();
        if (currentMinute < 45) {
          continue; // Too early, wait until :45
        }

        // Create proactive alert for each pattern
        for (const pattern of patterns) {
          // Check if alert already sent today
          const todayStart = new Date(lagosTime);
          todayStart.setHours(0, 0, 0, 0);

          const { data: existingAlert } = await supabase
            .from('proactive_vehicle_events')
            .select('id')
            .eq('device_id', deviceId)
            .eq('event_type', 'upcoming_trip')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

          if (existingAlert && existingAlert.length > 0) {
            continue; // Already alerted today
          }

          // Create proactive event
          const destinationName = pattern.destination_name || 
            `${pattern.destination_latitude.toFixed(5)}, ${pattern.destination_longitude.toFixed(5)}`;
          
          const { severity } = adjustSeverityByTimeOfDay('info', 'upcoming_trip', 'Africa/Lagos');

          const { error: insertError } = await supabase
            .from('proactive_vehicle_events')
            .insert({
              device_id: deviceId,
              event_type: 'upcoming_trip',
              severity: severity,
              title: 'Upcoming Trip Reminder',
              message: `Your typical trip to ${destinationName} usually starts in about 15 minutes.`,
              metadata: {
                pattern_id: pattern.pattern_id,
                destination_lat: pattern.destination_latitude,
                destination_lon: pattern.destination_longitude,
                avg_duration_minutes: pattern.avg_duration_minutes,
                avg_distance_km: pattern.avg_distance_km,
                is_at_origin: pattern.is_at_origin,
              },
              latitude: pattern.origin_latitude,
              longitude: pattern.origin_longitude,
              location_name: pattern.origin_name || 'Trip Origin',
              notified: false,
            });

          if (insertError) {
            console.error(`[check-upcoming-trips] Error creating alert for ${deviceId}:`, insertError);
          } else {
            alertsCreated++;
            console.log(`[check-upcoming-trips] Created alert for ${deviceId} - trip to ${destinationName}`);
          }
        }
      } catch (error) {
        console.error(`[check-upcoming-trips] Error processing ${deviceId}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Upcoming trips checked',
        vehicles_checked: deviceIds.length,
        alerts_created: alertsCreated,
        checked_at: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-upcoming-trips] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
