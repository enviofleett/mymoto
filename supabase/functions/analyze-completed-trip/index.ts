import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateDrivingEmbedding, formatEmbeddingForPg } from '../_shared/embedding-generator.ts';
import { callLLM } from '../_shared/llm-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Replaced by callLLM from shared client


interface PositionPoint {
  latitude: number;
  longitude: number;
  speed: number;
  gps_time: string;
  battery_percent: number | null;
  heading: number | null;
}

interface HarshEvent {
  type: 'harsh_braking' | 'harsh_acceleration' | 'harsh_cornering';
  timestamp: string;
  speed_delta: number;
  location: { lat: number; lon: number };
}

interface TripAnalysis {
  driver_score: number;
  harsh_events: {
    harsh_braking: number;
    harsh_acceleration: number;
    harsh_cornering: number;
    events: HarshEvent[];
  };
  summary_text: string;
  embedding?: number[];
}

// Calculate speed delta (km/h change per second) - proxy for G-force
function analyzePositionData(positions: PositionPoint[]): { harshEvents: HarshEvent[]; avgSpeed: number; maxSpeed: number; totalDistance: number } {
  const harshEvents: HarshEvent[] = [];
  let totalSpeed = 0;
  let maxSpeed = 0;
  let prevPosition: PositionPoint | null = null;
  
  for (const pos of positions) {
    totalSpeed += pos.speed;
    maxSpeed = Math.max(maxSpeed, pos.speed);
    
    if (prevPosition) {
      const timeDiff = (new Date(pos.gps_time).getTime() - new Date(prevPosition.gps_time).getTime()) / 1000;
      
      if (timeDiff > 0 && timeDiff < 60) { // Only consider points within 60 seconds
        const speedDelta = pos.speed - prevPosition.speed;
        const speedDeltaPerSec = speedDelta / timeDiff;
        
        // Harsh braking: deceleration > 10 km/h per second (~0.28g)
        if (speedDeltaPerSec < -10) {
          harshEvents.push({
            type: 'harsh_braking',
            timestamp: pos.gps_time,
            speed_delta: speedDeltaPerSec,
            location: { lat: pos.latitude, lon: pos.longitude }
          });
        }
        
        // Harsh acceleration: acceleration > 10 km/h per second
        if (speedDeltaPerSec > 10) {
          harshEvents.push({
            type: 'harsh_acceleration',
            timestamp: pos.gps_time,
            speed_delta: speedDeltaPerSec,
            location: { lat: pos.latitude, lon: pos.longitude }
          });
        }
        
        // Harsh cornering: significant heading change at speed
        if (prevPosition.heading !== null && pos.heading !== null && pos.speed > 20) {
          let headingDelta = Math.abs(pos.heading - prevPosition.heading);
          if (headingDelta > 180) headingDelta = 360 - headingDelta;
          
          // More than 45 degrees per second at speed
          if (headingDelta / timeDiff > 45) {
            harshEvents.push({
              type: 'harsh_cornering',
              timestamp: pos.gps_time,
              speed_delta: headingDelta / timeDiff,
              location: { lat: pos.latitude, lon: pos.longitude }
            });
          }
        }
      }
    }
    
    prevPosition = pos;
  }
  
  return {
    harshEvents,
    avgSpeed: positions.length > 0 ? totalSpeed / positions.length : 0,
    maxSpeed,
    totalDistance: 0 // Can be calculated from positions if needed
  };
}

// Calculate driver score (100 minus penalties)
function calculateDriverScore(harshEvents: HarshEvent[], tripDurationMinutes: number): number {
  let score = 100;
  
  // Penalty points per event (adjusted by trip duration)
  const penaltyPerBraking = 3;
  const penaltyPerAcceleration = 2;
  const penaltyPerCornering = 2;
  
  const brakingCount = harshEvents.filter(e => e.type === 'harsh_braking').length;
  const accelCount = harshEvents.filter(e => e.type === 'harsh_acceleration').length;
  const corneringCount = harshEvents.filter(e => e.type === 'harsh_cornering').length;
  
  score -= brakingCount * penaltyPerBraking;
  score -= accelCount * penaltyPerAcceleration;
  score -= corneringCount * penaltyPerCornering;
  
  // Bonus for longer trips without incidents (normalized)
  if (tripDurationMinutes > 30 && harshEvents.length === 0) {
    score = Math.min(100, score + 5);
  }
  
  return Math.max(0, Math.min(100, score));
}

// Generate AI summary of driving behavior
async function generateDrivingSummary(
  harshEvents: HarshEvent[],
  avgSpeed: number,
  maxSpeed: number,
  tripDurationMinutes: number,
  driverScore: number
): Promise<string> {
  const brakingCount = harshEvents.filter(e => e.type === 'harsh_braking').length;
  const accelCount = harshEvents.filter(e => e.type === 'harsh_acceleration').length;
  const corneringCount = harshEvents.filter(e => e.type === 'harsh_cornering').length;
  
  const prompt = `Analyze this driving telemetry and write a 2-sentence summary of the driver's behavior:
  
Trip Duration: ${tripDurationMinutes.toFixed(0)} minutes
Average Speed: ${avgSpeed.toFixed(1)} km/h
Maximum Speed: ${maxSpeed.toFixed(1)} km/h
Driver Score: ${driverScore}/100

Harsh Events:
- Harsh Braking: ${brakingCount} incidents
- Harsh Acceleration: ${accelCount} incidents
- Harsh Cornering: ${corneringCount} incidents

Write a concise 2-sentence summary focusing on driving safety and behavior patterns.`;

  try {
    // Use shared Lovable client
    const result = await callLLM(
      'You are a driving safety analyst. Analyze driving telemetry and provide concise summaries.',
      prompt,
      {
        maxOutputTokens: 150,
        temperature: 0.5,
        model: 'google/gemini-2.5-flash',
      }
    );
    
    return result.text || generateFallbackSummary(harshEvents, driverScore);
  } catch (error) {
    console.error('[Trip Analyzer] Error generating summary:', error);
    return generateFallbackSummary(harshEvents, driverScore);
  }
}

function generateFallbackSummary(harshEvents: HarshEvent[], driverScore: number): string {
  const totalEvents = harshEvents.length;
  if (totalEvents === 0) {
    return `Excellent driving performance with a score of ${driverScore}/100. No harsh events detected during this trip.`;
  } else if (driverScore >= 80) {
    return `Good driving with minor incidents (${totalEvents} harsh events). Score: ${driverScore}/100.`;
  } else {
    return `Driving needs improvement with ${totalEvents} harsh events detected. Score: ${driverScore}/100.`;
  }
}
// Note: generateSemanticEmbedding moved to shared embedding-generator.ts

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { trip_id, lookback_hours = 24 } = await req.json().catch(() => ({}));
    
    console.log('[Trip Analyzer] Starting analysis...', { trip_id, lookback_hours });

    let tripsToAnalyze: { id: string; device_id: string; start_time: string; end_time: string; duration_seconds: number }[] = [];

    if (trip_id) {
      // Analyze specific trip
      const { data: trip, error } = await supabase
        .from('vehicle_trips')
        .select('id, device_id, start_time, end_time, duration_seconds')
        .eq('id', trip_id)
        .single();
      
      if (error || !trip) {
        return new Response(JSON.stringify({ error: 'Trip not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      tripsToAnalyze = [trip];
    } else {
      // Find trips from the last N hours that haven't been analyzed
      // CRITICAL: Filter by source='gps51' for accurate GPS51 parity
      const lookbackTime = new Date(Date.now() - lookback_hours * 60 * 60 * 1000).toISOString();

      const { data: recentTrips, error } = await supabase
        .from('vehicle_trips')
        .select('id, device_id, start_time, end_time, duration_seconds')
        .eq('source', 'gps51')  // Only GPS51 trips for accuracy
        .gte('end_time', lookbackTime)
        .order('end_time', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('[Trip Analyzer] Error fetching trips:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Filter out already analyzed trips
      const tripIds = recentTrips?.map(t => t.id) || [];
      const { data: existingAnalytics } = await supabase
        .from('trip_analytics')
        .select('trip_id')
        .in('trip_id', tripIds);
      
      const analyzedIds = new Set(existingAnalytics?.map(a => a.trip_id) || []);
      tripsToAnalyze = recentTrips?.filter(t => !analyzedIds.has(t.id)) || [];
    }

    console.log(`[Trip Analyzer] Found ${tripsToAnalyze.length} trips to analyze`);

    const results: { trip_id: string; driver_score: number; success: boolean }[] = [];

    for (const trip of tripsToAnalyze) {
      try {
        console.log(`[Trip Analyzer] Analyzing trip ${trip.id}...`);
        
        // Fetch position history for this trip
        const { data: positions, error: posError } = await supabase
          .from('position_history')
          .select('latitude, longitude, speed, gps_time, battery_percent, heading')
          .eq('device_id', trip.device_id)
          .gte('gps_time', trip.start_time)
          .lte('gps_time', trip.end_time)
          .order('gps_time', { ascending: true });
        
        if (posError || !positions || positions.length < 2) {
          console.log(`[Trip Analyzer] Insufficient data for trip ${trip.id}`);
          continue;
        }
        
        // Analyze the positions
        const { harshEvents, avgSpeed, maxSpeed } = analyzePositionData(positions);
        const tripDurationMinutes = (trip.duration_seconds || 0) / 60;
        
        // Calculate driver score
        const driverScore = calculateDriverScore(harshEvents, tripDurationMinutes);
        
        // Generate AI summary
        const summaryText = await generateDrivingSummary(
          harshEvents,
          avgSpeed,
          maxSpeed,
          tripDurationMinutes,
          driverScore
        );
        
        // Generate embedding for semantic search using shared generator
        const harshBrakingCount = harshEvents.filter(e => e.type === 'harsh_braking').length;
        const harshAccelCount = harshEvents.filter(e => e.type === 'harsh_acceleration').length;
        const harshCorneringCount = harshEvents.filter(e => e.type === 'harsh_cornering').length;
        
        const embedding = generateDrivingEmbedding(
          summaryText,
          driverScore,
          harshBrakingCount,
          harshAccelCount,
          harshCorneringCount,
          avgSpeed,
          maxSpeed
        );
        
        // Prepare harsh events summary
        const harshEventsSummary = {
          harsh_braking: harshEvents.filter(e => e.type === 'harsh_braking').length,
          harsh_acceleration: harshEvents.filter(e => e.type === 'harsh_acceleration').length,
          harsh_cornering: harshEvents.filter(e => e.type === 'harsh_cornering').length,
          total_events: harshEvents.length,
          events: harshEvents.slice(0, 10), // Store first 10 events
        };
        
        // Insert into trip_analytics
        const { error: insertError } = await supabase
          .from('trip_analytics')
          .insert({
            trip_id: trip.id,
            device_id: trip.device_id,
            driver_score: driverScore,
            harsh_events: harshEventsSummary,
            summary_text: summaryText,
            weather_data: {}, // Can be enhanced with weather API
            embedding: formatEmbeddingForPg(embedding),
          });
        
        if (insertError) {
          console.error(`[Trip Analyzer] Error inserting analytics for trip ${trip.id}:`, insertError);
          results.push({ trip_id: trip.id, driver_score: driverScore, success: false });
        } else {
          console.log(`[Trip Analyzer] Successfully analyzed trip ${trip.id}, score: ${driverScore}`);
          results.push({ trip_id: trip.id, driver_score: driverScore, success: true });
        }
        
      } catch (tripError) {
        console.error(`[Trip Analyzer] Error analyzing trip ${trip.id}:`, tripError);
        results.push({ trip_id: trip.id, driver_score: 0, success: false });
      }
    }

    return new Response(JSON.stringify({
      message: 'Trip analysis complete',
      trips_found: tripsToAnalyze.length,
      trips_analyzed: results.filter(r => r.success).length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Trip Analyzer] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
