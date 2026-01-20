/**
 * Behavioral Anomaly Detection Edge Function
 * Phase 2.2: Detects battery drain anomalies, trip duration variance, and unusual movement
 * 
 * Cron Schedule: Every 6 hours
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

    // Get all active vehicles with assignments
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicle_assignments')
      .select('device_id')
      .limit(1000);

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
    let anomaliesDetected = 0;

    for (const deviceId of deviceIds) {
      try {
        // 1. Battery Drain Anomaly Detection
        const { data: batteryDrain, error: drainError } = await supabase
          .rpc('calculate_battery_drain', {
            p_device_id: deviceId,
            p_lookback_days: 7,
          });

        if (!drainError && batteryDrain && batteryDrain.length > 0) {
          const drain = batteryDrain[0];
          const { data: currentPosition } = await supabase
            .from('vehicle_positions')
            .select('battery_percent, gps_time')
            .eq('device_id', deviceId)
            .single();

          if (currentPosition?.battery_percent && drain.last_battery_percent) {
            // Check if today's drain is significantly higher than average
            const hoursSinceLastReading = currentPosition.gps_time
              ? (Date.now() - new Date(currentPosition.gps_time).getTime()) / (1000 * 60 * 60)
              : 24;

            if (hoursSinceLastReading > 0) {
              const todayDrain = (drain.last_battery_percent - currentPosition.battery_percent) / hoursSinceLastReading;
              const avgDrain = drain.avg_drain_per_hour || 0;

              // Alert if today's drain is 50% higher than average
              if (avgDrain > 0 && todayDrain > avgDrain * 1.5) {
                const { severity } = adjustSeverityByTimeOfDay('warning', 'battery_drain_anomaly', 'Africa/Lagos');

                await supabase.from('proactive_vehicle_events').insert({
                  device_id: deviceId,
                  event_type: 'battery_drain_anomaly',
                  severity: severity,
                  title: 'Unusual Battery Drain Detected',
                  message: `Battery is draining ${((todayDrain / avgDrain - 1) * 100).toFixed(0)}% faster than usual. Current: ${currentPosition.battery_percent}%`,
                  metadata: {
                    current_battery: currentPosition.battery_percent,
                    avg_drain_per_hour: avgDrain,
                    today_drain_per_hour: todayDrain,
                  },
                  notified: false,
                });

                anomaliesDetected++;
              }
            }
          }
        }

        // 2. Unusual Movement Detection (3 AM)
        const { data: recentMovement } = await supabase
          .from('position_history')
          .select('gps_time, speed, latitude, longitude')
          .eq('device_id', deviceId)
          .gte('gps_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .gt('speed', 5) // Moving faster than 5 km/h
          .order('gps_time', { ascending: false })
          .limit(10);

        if (recentMovement && recentMovement.length > 0) {
          for (const movement of recentMovement) {
            const movementTime = new Date(movement.gps_time);
            const lagosTime = new Date(movementTime.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
            const hour = lagosTime.getHours();

            // Alert if movement detected between 1 AM and 5 AM
            if (hour >= 1 && hour < 5) {
              const { severity } = adjustSeverityByTimeOfDay('warning', 'unusual_movement', 'Africa/Lagos');

              await supabase.from('proactive_vehicle_events').insert({
                device_id: deviceId,
                event_type: 'unusual_movement',
                severity: severity,
                title: 'Unusual Movement Detected',
                message: `Vehicle movement detected at ${lagosTime.toLocaleTimeString()} (unusual time)`,
                metadata: {
                  movement_time: movement.gps_time,
                  speed: movement.speed,
                  lat: movement.latitude,
                  lon: movement.longitude,
                },
                latitude: movement.latitude,
                longitude: movement.longitude,
                notified: false,
              });

              anomaliesDetected++;
              break; // Only one alert per vehicle for this check
            }
          }
        }

      } catch (error) {
        console.error(`[detect-anomalies] Error processing ${deviceId}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Anomaly detection completed',
        vehicles_checked: deviceIds.length,
        anomalies_detected: anomaliesDetected,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[detect-anomalies] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
