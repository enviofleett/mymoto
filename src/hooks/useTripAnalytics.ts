import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface TripAnalytics {
  id: string;
  trip_id: string;
  device_id: string;
  driver_score: number;
  harsh_events: {
    harsh_braking: number;
    harsh_acceleration: number;
    harsh_cornering: number;
    total_events: number;
  } | null;
  summary_text: string | null;
  weather_data: Json;
  analyzed_at: string;
}

export interface DriverScoreData {
  driver_score: number;
  harsh_braking_count: number;
  harsh_acceleration_count: number;
  recent_trend: 'improving' | 'declining' | 'stable';
  trips_analyzed: number;
}

// Helper to safely parse harsh_events from Json
function parseHarshEvents(harshEvents: Json): TripAnalytics['harsh_events'] {
  if (!harshEvents || typeof harshEvents !== 'object' || Array.isArray(harshEvents)) {
    return null;
  }
  const events = harshEvents as Record<string, unknown>;
  return {
    harsh_braking: typeof events.harsh_braking === 'number' ? events.harsh_braking : 0,
    harsh_acceleration: typeof events.harsh_acceleration === 'number' ? events.harsh_acceleration : 0,
    harsh_cornering: typeof events.harsh_cornering === 'number' ? events.harsh_cornering : 0,
    total_events: typeof events.total_events === 'number' ? events.total_events : 0,
  };
}

// Fetch trip analytics for a specific trip
export function useTripAnalytics(tripId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['trip-analytics', tripId],
    queryFn: async (): Promise<TripAnalytics | null> => {
      if (!tripId) return null;
      
      const { data, error } = await (supabase as any)
        .from('trip_analytics')
        .select('*')
        .eq('trip_id', tripId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching trip analytics:', error);
        throw error;
      }
      
      if (!data) return null;
      
      return {
        ...data,
        harsh_events: parseHarshEvents(data.harsh_events),
      } as TripAnalytics;
    },
    enabled: enabled && !!tripId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Fetch latest driver score for a device
export function useDriverScore(deviceId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['driver-score', deviceId],
    queryFn: async (): Promise<DriverScoreData | null> => {
      if (!deviceId) return null;
      
      const { data, error } = await (supabase
        .rpc as any)('get_latest_driver_score', { p_device_id: deviceId });
      
      if (error) {
        console.error('Error fetching driver score:', error);
        throw error;
      }
      
      // RPC returns an array, get first result
      const result = Array.isArray(data) ? data[0] : data;
      return result as DriverScoreData | null;
    },
    enabled: enabled && !!deviceId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Fetch recent trip analytics for a device
export function useRecentTripAnalytics(deviceId: string | null, limit = 10, enabled = true) {
  return useQuery({
    queryKey: ['recent-trip-analytics', deviceId, limit],
    queryFn: async (): Promise<TripAnalytics[]> => {
      if (!deviceId) return [];
      
      const { data, error } = await (supabase as any)
        .from('trip_analytics')
        .select('*')
        .eq('device_id', deviceId)
        .order('analyzed_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Error fetching recent trip analytics:', error);
        throw error;
      }
      
      return (data || []).map((item: any) => ({
        ...item,
        harsh_events: parseHarshEvents(item.harsh_events),
      })) as TripAnalytics[];
    },
    enabled: enabled && !!deviceId,
    staleTime: 2 * 60 * 1000,
  });
}

// Get score color based on value
export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-500';
  if (score >= 75) return 'text-yellow-500';
  if (score >= 50) return 'text-orange-500';
  return 'text-red-500';
}

// Get score label based on value
export function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

// Get trend icon direction
export function getTrendDirection(trend: string): 'up' | 'down' | 'stable' {
  if (trend === 'improving') return 'up';
  if (trend === 'declining') return 'down';
  return 'stable';
}
