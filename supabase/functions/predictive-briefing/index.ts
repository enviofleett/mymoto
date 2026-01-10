import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface PredictedTrip {
  pattern_id: string;
  device_id: string;
  origin_latitude: number;
  origin_longitude: number;
  origin_name: string | null;
  destination_latitude: number;
  destination_longitude: number;
  destination_name: string | null;
  typical_start_hour: number;
  occurrence_count: number;
  avg_duration_minutes: number;
  avg_distance_km: number;
  confidence_score: number;
}

interface VehiclePosition {
  device_id: string;
  latitude: number;
  longitude: number;
  battery_percent: number | null;
  is_online: boolean;
  speed: number;
}

// Calculate distance between two coordinates in km (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Mock traffic API - returns estimated delay factor (1.0 = normal, 1.5 = 50% slower)
async function getTrafficFactor(originLat: number, originLon: number, destLat: number, destLon: number): Promise<{ factor: number; condition: string }> {
  // Mock implementation - in production, integrate with Google Maps, TomTom, or HERE API
  const hour = new Date().getHours();
  
  // Rush hour simulation
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
    const randomFactor = 1.2 + Math.random() * 0.5; // 1.2 to 1.7
    return { 
      factor: randomFactor, 
      condition: randomFactor > 1.4 ? 'heavy traffic' : 'moderate traffic' 
    };
  }
  
  return { factor: 1.0, condition: 'light traffic' };
}

// Generate a personalized morning briefing message
function generateBriefingMessage(
  pattern: PredictedTrip,
  position: VehiclePosition,
  traffic: { factor: number; condition: string },
  vehicleName: string
): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  
  const destination = pattern.destination_name || 'your usual destination';
  const estimatedDuration = Math.round(pattern.avg_duration_minutes * traffic.factor);
  const normalDuration = Math.round(pattern.avg_duration_minutes);
  
  let message = `${greeting}! 🚗\n\n`;
  message += `I noticed you usually head to **${destination}** around this time. `;
  
  // Traffic info
  if (traffic.factor > 1.2) {
    const extraMinutes = estimatedDuration - normalDuration;
    message += `There's ${traffic.condition} right now — expect about **${estimatedDuration} minutes** (${extraMinutes} min longer than usual). `;
  } else {
    message += `Traffic looks good! Should take about **${estimatedDuration} minutes**. `;
  }
  
  // Battery check
  if (position.battery_percent !== null && position.battery_percent > 0) {
    if (position.battery_percent < 20) {
      message += `\n\n⚠️ **Battery Alert**: Your vehicle is at ${position.battery_percent}%. You might want to charge before heading out.`;
    } else if (position.battery_percent < 50) {
      message += `\n\n🔋 Battery is at ${position.battery_percent}%.`;
    }
  }
  
  // Distance info
  message += `\n\n📍 Distance: ~${pattern.avg_distance_km.toFixed(1)} km`;
  
  // Confidence note
  if (pattern.occurrence_count >= 10) {
    message += `\n\n_Based on ${pattern.occurrence_count} previous trips on this day._`;
  }
  
  return message;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Predictive Briefing] Starting pattern analysis...');
    
    // First, refresh trip patterns
    const { data: patternResult, error: patternError } = await supabase.rpc('analyze_trip_patterns');
    if (patternError) {
      console.error('[Predictive Briefing] Error analyzing patterns:', patternError);
    } else {
      console.log('[Predictive Briefing] Pattern analysis result:', patternResult);
    }
    
    // Get predicted trips for the next hour
    const { data: predictions, error: predError } = await supabase.rpc('get_predicted_trips');
    
    if (predError) {
      console.error('[Predictive Briefing] Error getting predictions:', predError);
      return new Response(JSON.stringify({ error: predError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[Predictive Briefing] Found ${predictions?.length || 0} predicted trips`);
    
    if (!predictions || predictions.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No predicted trips for this hour',
        briefings_sent: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const briefingsSent: string[] = [];
    const processedDevices = new Set<string>();
    
    for (const prediction of predictions as PredictedTrip[]) {
      // Skip if we already processed this device (one briefing per device per run)
      if (processedDevices.has(prediction.device_id)) continue;
      
      // Check if we already sent a briefing for this pattern today
      const today = new Date().toISOString().split('T')[0];
      const { data: existingBriefing } = await supabase
        .from('vehicle_chat_history')
        .select('id')
        .eq('device_id', prediction.device_id)
        .eq('role', 'assistant')
        .ilike('content', '%I noticed you usually head to%')
        .gte('created_at', today)
        .limit(1);
      
      if (existingBriefing && existingBriefing.length > 0) {
        console.log(`[Predictive Briefing] Already sent briefing for ${prediction.device_id} today`);
        continue;
      }
      
      // Get current vehicle position
      const { data: position, error: posError } = await supabase
        .from('vehicle_positions')
        .select('device_id, latitude, longitude, battery_percent, is_online, speed')
        .eq('device_id', prediction.device_id)
        .single();
      
      if (posError || !position) {
        console.log(`[Predictive Briefing] No position data for ${prediction.device_id}`);
        continue;
      }
      
      // Check if vehicle is at the pattern's origin (within 500m)
      const distanceFromOrigin = calculateDistance(
        position.latitude,
        position.longitude,
        prediction.origin_latitude,
        prediction.origin_longitude
      );
      
      if (distanceFromOrigin > 0.5) { // More than 500m from origin
        console.log(`[Predictive Briefing] Vehicle ${prediction.device_id} not at origin (${distanceFromOrigin.toFixed(2)}km away)`);
        continue;
      }
      
      // Get traffic conditions (mock for now)
      const traffic = await getTrafficFactor(
        prediction.origin_latitude,
        prediction.origin_longitude,
        prediction.destination_latitude,
        prediction.destination_longitude
      );
      
      // Get vehicle name
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('device_name')
        .eq('device_id', prediction.device_id)
        .single();
      
      const { data: assignment } = await supabase
        .from('vehicle_assignments')
        .select('vehicle_alias, profile_id')
        .eq('device_id', prediction.device_id)
        .single();
      
      const vehicleName = assignment?.vehicle_alias || vehicle?.device_name || prediction.device_id;
      
      // Generate personalized briefing
      const briefingMessage = generateBriefingMessage(prediction, position, traffic, vehicleName);
      
      // Insert into chat history as assistant message
      const { error: insertError } = await supabase
        .from('vehicle_chat_history')
        .insert({
          device_id: prediction.device_id,
          user_id: assignment?.profile_id || null,
          role: 'assistant',
          content: briefingMessage,
        });
      
      if (insertError) {
        console.error(`[Predictive Briefing] Error inserting briefing for ${prediction.device_id}:`, insertError);
      } else {
        console.log(`[Predictive Briefing] Sent briefing for ${prediction.device_id}`);
        briefingsSent.push(prediction.device_id);
        processedDevices.add(prediction.device_id);
      }
    }
    
    return new Response(JSON.stringify({ 
      message: `Predictive briefing complete`,
      predictions_found: predictions.length,
      briefings_sent: briefingsSent.length,
      devices: briefingsSent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[Predictive Briefing] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
