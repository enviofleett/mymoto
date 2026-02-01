import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============ Types ============

export interface VehicleTrip {
  id: string;
  device_id: string;
  start_time: string;
  end_time: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  distance_km: number;
  max_speed: number | null;
  avg_speed: number | null;
  duration_seconds: number | null;
}

export interface VehicleEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
  acknowledged: boolean;
  metadata: Record<string, unknown>;
}

export interface VehicleLLMSettings {
  device_id: string;
  nickname: string | null;
  language_preference: string;
  personality_mode: string;
  llm_enabled: boolean;
  avatar_url: string | null;
}

export interface MileageStats {
  today: number;
  week: number;
  month: number;
  trips_today: number;
  trips_week: number;
}

export interface DailyMileage {
  day: string;
  date: string;
  distance: number;
  trips: number;
}

// New: Pre-calculated daily stats from database view
export interface VehicleDailyStats {
  device_id: string;
  stat_date: string;
  trip_count: number;
  total_distance_km: number;
  avg_distance_km: number;
  peak_speed: number | null;
  avg_speed: number | null;
  total_duration_seconds: number;
  first_trip_start: string;
  last_trip_end: string;
}

export interface VehicleMileageDetail {
  id: string;
  device_id: string;
  statisticsday: string;
  totaldistance: number | null;
  oilper100km: number | null; // Actual measured (GPS51)
  runoilper100km: number | null;
  oilperhour: number | null;
  estimated_fuel_consumption_combined: number | null; // Manufacturer estimate
  estimated_fuel_consumption_city: number | null;
  estimated_fuel_consumption_highway: number | null;
  fuel_consumption_variance: number | null; // % difference
  leakoil: number | null; // Fuel theft detection
  totalacc: number | null; // ACC time (ms)
}

// ============ Fetch Functions ============

export interface TripDateRange {
  from?: Date;
  to?: Date;
}



async function fetchVehicleTrips(
  deviceId: string, 
  limit: number = 200,
  dateRange?: TripDateRange
): Promise<VehicleTrip[]> {
  if (import.meta.env.DEV) {
    console.log('[fetchVehicleTrips] Fetching trips for device:', deviceId, 'limit:', limit, 'dateRange:', dateRange);
  }
  
  let query = (supabase as any)
    .from("vehicle_trips")
    .select("*")
    .eq("device_id", deviceId)
    .eq("source", "gps51") // STRICT PARITY: Only show trips from GPS51
    // Only require start_time and end_time - coordinates might be missing (0,0) for some trips
    .not("start_time", "is", null)
    .not("end_time", "is", null);

  // CRITICAL OPTIMIZATION: If no dateRange provided, prioritize last 24 hours for instant loading
  if (dateRange?.from) {
    const fromDate = new Date(dateRange.from);
    fromDate.setHours(0, 0, 0, 0);
    query = query.gte("start_time", fromDate.toISOString());
    if (import.meta.env.DEV) {
      console.log('[fetchVehicleTrips] Date filter FROM:', fromDate.toISOString());
    }
  } else {
    // No explicit date range - prioritize last 24 hours for instant loading
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    query = query.gte("start_time", last24Hours.toISOString());
    if (import.meta.env.DEV) {
      console.log('[fetchVehicleTrips] Auto-filtering last 24 hours for instant load:', last24Hours.toISOString());
    }
  }
  
  if (dateRange?.to) {
    // Include entire "to" date by setting to end of day
    const endDate = new Date(dateRange.to);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(0, 0, 0, 0);
    query = query.lt("start_time", endDate.toISOString());
    if (import.meta.env.DEV) {
      console.log('[fetchVehicleTrips] Date filter TO:', endDate.toISOString());
    }
  }

  // Always order by start_time DESC to get newest first, then limit
  const { data, error } = await query
    .order("start_time", { ascending: false })
    .limit(limit);
  

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[fetchVehicleTrips] Query error:', error);
    }
    throw error;
  }
  
  console.log('[fetchVehicleTrips] Received', data?.length || 0, 'trips from database');
  
  if (data && data.length > 0) {
    const dates = data.map((t: any) => new Date(t.start_time).toISOString().split('T')[0]);
    const uniqueDates = [...new Set(dates)];
    if (import.meta.env.DEV) {
      console.log('[fetchVehicleTrips] Trip date range:', dates[dates.length - 1], 'to', dates[0]);
      console.log('[fetchVehicleTrips] Unique dates found:', uniqueDates.sort().reverse());
      console.log('[fetchVehicleTrips] First trip:', data[0]?.start_time, 'Last trip:', data[data.length - 1]?.start_time);
    }
    
    // CRITICAL DEBUG: Check if we're missing recent trips
    const today = new Date().toISOString().split('T')[0];
    const tripsToday = dates.filter(d => d === today).length;
    const tripsYesterday = dates.filter(d => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return d === yesterday.toISOString().split('T')[0];
    }).length;
    if (import.meta.env.DEV) {
      console.log('[fetchVehicleTrips] Trips today:', tripsToday, 'Trips yesterday:', tripsYesterday);
    }
    
    if (tripsToday === 0 && tripsYesterday === 0 && dates.length > 0) {
      if (import.meta.env.DEV) {
        console.warn('[fetchVehicleTrips] WARNING: No trips from today or yesterday, but have trips from:', uniqueDates[0]);
      }
    }
  } else {
    if (import.meta.env.DEV) {
      console.warn('[fetchVehicleTrips] No trips returned from query!');
    }
  }
  
  // Filter and process trips
  // CRITICAL FIX: Include ALL trips that have start_time and end_time, even if coordinates are 0
  // This allows trips with missing GPS data to still be displayed
  const filteredTrips = ((data as any[]) || [])
    .filter((trip: any) => {
      // Only require start_time and end_time - coordinates can be 0 (missing GPS data)
      return trip.start_time && trip.end_time;
    });
  
  if (import.meta.env.DEV) {
    console.log('[fetchVehicleTrips] After filtering:', {
      before: data?.length || 0,
      after: filteredTrips.length,
      filteredOut: (data?.length || 0) - filteredTrips.length
    });
  }
  
  return filteredTrips
    .map((trip: any): VehicleTrip => {
      // CRITICAL: Use database distance (GPS51 source of truth) ONLY
      // Do NOT estimate distance from duration/speed or coordinates
      const distanceKm = trip.distance_km || 0;

      return {
        id: trip.id,
        device_id: trip.device_id,
        start_time: trip.start_time,
        end_time: trip.end_time,
        start_latitude: trip.start_latitude,
        start_longitude: trip.start_longitude,
        end_latitude: trip.end_latitude,
        end_longitude: trip.end_longitude,
        distance_km: Math.round(distanceKm * 100) / 100, // Round to 2 decimal places
        max_speed: trip.max_speed,
        avg_speed: trip.avg_speed,
        duration_seconds: trip.duration_seconds,
      };
    });
}


async function fetchVehicleLLMSettings(deviceId: string): Promise<VehicleLLMSettings | null> {
  const { data, error } = await (supabase as any)
    .from("vehicle_llm_settings")
    .select("device_id, nickname, language_preference, personality_mode, llm_enabled")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  return (data as VehicleLLMSettings) || null;
}

async function fetchMileageStats(deviceId: string): Promise<MileageStats> {
  const { data, error } = await (supabase as any).rpc("get_vehicle_mileage_stats", {
    p_device_id: deviceId,
  });

  if (error) {
    console.error("Error fetching mileage stats:", error);
    return { today: 0, week: 0, month: 0, trips_today: 0, trips_week: 0 };
  }

  return data as unknown as MileageStats;
}

async function fetchDailyMileage(deviceId: string): Promise<DailyMileage[]> {
  const { data, error } = await (supabase as any).rpc("get_daily_mileage", {
    p_device_id: deviceId,
  });

  if (error) {
    console.error("Error fetching daily mileage:", error);
    return [];
  }

  return (data || []) as unknown as DailyMileage[];
}

// New: Fetch from vehicle_daily_stats view - pre-calculated server-side
async function fetchVehicleDailyStats(
  deviceId: string,
  days: number = 30
): Promise<VehicleDailyStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Use raw SQL query to avoid type issues with views
  const { data, error } = await supabase
    .rpc('get_vehicle_daily_stats' as any, {
      p_device_id: deviceId,
      p_days: days
    });

  if (error) {
    // Fallback to direct view query if RPC doesn't exist
    const { data: viewData, error: viewError } = await (supabase as any)
      .from("vehicle_daily_stats")
      .select("*")
      .eq("device_id", deviceId)
      .gte("stat_date", startDate.toISOString().split('T')[0])
      .order("stat_date", { ascending: false });

    if (viewError) {
      console.error("Error fetching vehicle daily stats:", viewError);
      return [];
    }
    
    return (viewData || []) as VehicleDailyStats[];
  }
  
  return (data || []) as unknown as VehicleDailyStats[];
}

// ============ Command Execution ============

interface CommandPayload {
  device_id: string;
  command_type: "immobilize_engine" | "demobilize_engine" | "sound_alarm" | "silence_alarm";
  confirmed?: boolean;
}

async function executeVehicleCommand(payload: CommandPayload): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke("execute-vehicle-command", {
    body: { ...payload, skip_confirmation: true },
  });

  if (error) {
    throw new Error(error.message || "Failed to execute command");
  }

  return data as { success: boolean; message: string };
}

// ============ Hooks ============

export interface TripFilterOptions {
  dateRange?: TripDateRange;
  limit?: number;
  /** When true, poll every 30s on vehicle profile so trips/stats stay live. */
  live?: boolean;
}

export function useVehicleTrips(
  deviceId: string | null,
  options: TripFilterOptions = {},
  enabled: boolean = true
) {
  const { dateRange, limit = 200, live = false } = options;

  return useQuery({
    queryKey: ["vehicle-trips", deviceId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), limit],
    queryFn: () => fetchVehicleTrips(deviceId!, limit, dateRange),
    enabled: enabled && !!deviceId,
    staleTime: live ? 30 * 1000 : 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: live ? 30 * 1000 : false,
    refetchIntervalInBackground: live,
    placeholderData: (previousData) => previousData,
  });
}

export interface EventFilterOptions {
  dateRange?: TripDateRange;
  limit?: number;
}

async function fetchVehicleEvents(
  deviceId: string, 
  limit: number = 50,
  dateRange?: TripDateRange
): Promise<VehicleEvent[]> {
  let query = (supabase as any)
    .from("proactive_vehicle_events")
    .select("*")
    .eq("device_id", deviceId);

  // CRITICAL OPTIMIZATION: If no dateRange provided, prioritize last 24 hours
  if (dateRange?.from) {
    query = query.gte("created_at", dateRange.from.toISOString());
  } else {
    // Auto-filter last 24 hours for instant loading
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    query = query.gte("created_at", last24Hours.toISOString());
  }
  
  if (dateRange?.to) {
    const endDate = new Date(dateRange.to);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt("created_at", endDate.toISOString());
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data as any[]) || []) as VehicleEvent[];
}

export function useVehicleEvents(
  deviceId: string | null, 
  options: EventFilterOptions = {},
  enabled: boolean = true
) {
  const { dateRange, limit = 50 } = options;
  
  return useQuery({
    queryKey: ["vehicle-events", deviceId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), limit],
    queryFn: () => fetchVehicleEvents(deviceId!, limit, dateRange),
    enabled: enabled && !!deviceId,
    staleTime: 24 * 60 * 60 * 1000, // Fresh for 24 hours
    gcTime: 48 * 60 * 60 * 1000, // Keep in cache for 48 hours
    placeholderData: (previousData) => previousData, // Show cached data instantly
  });
}

export function useVehicleLLMSettings(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["vehicle-llm-settings", deviceId],
    queryFn: () => fetchVehicleLLMSettings(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

export function useMileageStats(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["mileage-stats", deviceId],
    queryFn: () => fetchMileageStats(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 2 * 60 * 1000, // Fresh for 2 minutes
    gcTime: 5 * 60 * 1000,
  });
}

export function useDailyMileage(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ["daily-mileage", deviceId],
    queryFn: () => fetchDailyMileage(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// New: Hook to fetch pre-calculated daily stats from database view
export function useVehicleDailyStats(
  deviceId: string | null, 
  days: number = 30, 
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["vehicle-daily-stats", deviceId, days],
    queryFn: () => fetchVehicleDailyStats(deviceId!, days),
    enabled: enabled && !!deviceId,
    staleTime: 24 * 60 * 60 * 1000, // Fresh for 24 hours (last 24h data loads instantly)
    gcTime: 48 * 60 * 60 * 1000, // Keep in cache for 48 hours
    placeholderData: (previousData) => previousData, // Show cached data instantly
  });
}

async function fetchVehicleMileageDetails(
  deviceId: string,
  startDate?: string,
  endDate?: string
): Promise<VehicleMileageDetail[]> {
  // NOTE: vehicle_mileage_details table doesn't exist in GPS51 implementation
  // This function returns empty array since fuel consumption data is not available from GPS51
  // The component (MileageSection) uses vehicle_daily_stats via useVehicleDailyStats for trip/mileage data
  // Fuel consumption features are not available with GPS51 data source
  
  if (import.meta.env.DEV) {
    console.log('[fetchVehicleMileageDetails] vehicle_mileage_details not available - using GPS51 vehicle_daily_stats instead. Fuel consumption data not available.');
  }
  
  // Return empty array - fuel consumption data is not part of GPS51 trip data
  // The component handles this gracefully with hasMileageData check
  return [];
}

export function useVehicleMileageDetails(
  deviceId: string | null,
  startDate?: string,
  endDate?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["vehicle-mileage-details", deviceId, startDate, endDate],
    queryFn: () => {
      if (!deviceId) return Promise.resolve([]);
      return fetchVehicleMileageDetails(deviceId, startDate, endDate);
    },
    enabled: enabled && !!deviceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if table doesn't exist
    // Don't throw errors for missing table - it's expected if migration hasn't been applied
    throwOnError: (error: any) => {
      // Only throw if it's not a "table not found" error
      return !(error?.code === 'PGRST205' || error?.message?.includes('Could not find the table'));
    },
  });
}

// Derived stats from VehicleDailyStats
export interface DerivedMileageData {
  totalDistance: number;
  totalTrips: number;
  avgPerDay: number;
  peakSpeed: number;
  avgKmPerTrip: number;
  daysWithData: number;
}

export function deriveMileageFromStats(stats: VehicleDailyStats[]): DerivedMileageData {
  if (!stats || stats.length === 0) {
    return { totalDistance: 0, totalTrips: 0, avgPerDay: 0, peakSpeed: 0, avgKmPerTrip: 0, daysWithData: 0 };
  }
  
  const totalDistance = stats.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
  const totalTrips = stats.reduce((sum, s) => sum + s.trip_count, 0);
  const peakSpeed = Math.max(...stats.map(s => s.peak_speed || 0));
  const daysWithData = stats.length;
  
  return {
    totalDistance,
    totalTrips,
    avgPerDay: daysWithData > 0 ? totalDistance / daysWithData : 0,
    peakSpeed,
    avgKmPerTrip: totalTrips > 0 ? totalDistance / totalTrips : 0,
    daysWithData,
  };
}

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeVehicleCommand,
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(data.message || "Command sent successfully");
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ["vehicle-events", variables.device_id] });
      } else {
        toast.error(data.message || "Command failed");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send command");
    },
  });
}

// ============ Prefetch Function ============

export function usePrefetchVehicleProfile() {
  const queryClient = useQueryClient();

  const prefetchAll = (deviceId: string) => {
    // Prefetch last 24 hours of trips for instant loading
    queryClient.prefetchQuery({
      queryKey: ["vehicle-trips", deviceId, undefined, undefined, 200],
      queryFn: () => fetchVehicleTrips(deviceId, 200), // Will auto-filter last 24h
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Prefetch last 24 hours of events
    queryClient.prefetchQuery({
      queryKey: ["vehicle-events", deviceId, undefined, undefined, 50],
      queryFn: () => fetchVehicleEvents(deviceId, 50), // Will auto-filter last 24h
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Prefetch live data (async import to avoid circular dependency)
    Promise.resolve().then(async () => {
      const { fetchVehicleLiveData } = await import("@/hooks/useVehicleLiveData");
      queryClient.prefetchQuery({
        queryKey: ["vehicle-live-data", deviceId],
        queryFn: () => fetchVehicleLiveData(deviceId),
        staleTime: 24 * 60 * 60 * 1000,
      });
    });

    queryClient.prefetchQuery({
      queryKey: ["mileage-stats", deviceId],
      queryFn: () => fetchMileageStats(deviceId),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });

    queryClient.prefetchQuery({
      queryKey: ["daily-mileage", deviceId],
      queryFn: () => fetchDailyMileage(deviceId),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });

    queryClient.prefetchQuery({
      queryKey: ["vehicle-llm-settings", deviceId],
      queryFn: () => fetchVehicleLLMSettings(deviceId),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });
    
    // Prefetch vehicle daily stats from view (last 30 days, but cached for 24h)
    queryClient.prefetchQuery({
      queryKey: ["vehicle-daily-stats", deviceId, 30],
      queryFn: () => fetchVehicleDailyStats(deviceId, 30),
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    });
  };

  return { prefetchAll };
}

// ============ Personality Mode Labels ============

export const personalityModeLabels: Record<string, string> = {
  casual: "Friendly & Casual",
  professional: "Professional & Formal",
  enthusiastic: "Enthusiastic & Adventurous",
};

export function getPersonalityLabel(mode: string | null | undefined): string {
  if (!mode) return "Not configured";
  return personalityModeLabels[mode] || mode;
}
