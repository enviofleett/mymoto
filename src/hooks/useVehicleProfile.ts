import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatLagos } from "@/lib/timezone";
import { fetchVehicleLiveData } from "@/hooks/useVehicleLiveData";

// ============ Types ============

export interface VehicleTrip {
  id: string;
  device_id: string;
  start_time: string;
  end_time: string | null; // CRITICAL: Allow null for ongoing trips
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  distance_km: number | null;
  max_speed: number | null;
  avg_speed: number | null;
  duration_seconds: number | null;
  source?: string | null;
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

type Gps51TripRow = {
  id: string;
  device_id: string;
  start_time: string;
  end_time: string | null;
  start_latitude: number | string | null;
  start_longitude: number | string | null;
  end_latitude: number | string | null;
  end_longitude: number | string | null;
  distance_meters: number | string | null;
  avg_speed_kmh: number | string | null;
  max_speed_kmh: number | string | null;
  duration_seconds: number | string | null;
};

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function mapGps51TripRowToVehicleTrip(row: Gps51TripRow): VehicleTrip {
  const distanceMeters = toNumberOrNull(row.distance_meters);
  const avgSpeed = toNumberOrNull(row.avg_speed_kmh);
  const maxSpeed = toNumberOrNull(row.max_speed_kmh);
  const durationSeconds = toNumberOrNull(row.duration_seconds);

  return {
    id: row.id,
    device_id: row.device_id,
    start_time: row.start_time,
    end_time: row.end_time ?? null,
    start_latitude: toNumberOrNull(row.start_latitude),
    start_longitude: toNumberOrNull(row.start_longitude),
    end_latitude: toNumberOrNull(row.end_latitude),
    end_longitude: toNumberOrNull(row.end_longitude),
    distance_km: distanceMeters === null ? null : distanceMeters / 1000,
    avg_speed: avgSpeed,
    max_speed: maxSpeed,
    duration_seconds: durationSeconds,
    source: "gps51",
  };
}

async function fetchGps51Trips(
  deviceId: string,
  limit: number = 200,
  dateRange?: TripDateRange
): Promise<VehicleTrip[]> {
  if (import.meta.env.DEV) {
    console.log("[fetchGps51Trips] Fetching trips for device:", deviceId, "limit:", limit, "dateRange:", dateRange);
  }

  let query = (supabase as any)
    .from("gps51_trips")
    .select(
      "id, device_id, start_time, end_time, start_latitude, start_longitude, end_latitude, end_longitude, distance_meters, avg_speed_kmh, max_speed_kmh, duration_seconds"
    )
    .eq("device_id", deviceId)
    .order("start_time", { ascending: false })
    .limit(limit);

  if (dateRange?.from) {
    query = query.gte("start_time", dateRange.from.toISOString());
  }

  if (dateRange?.to) {
    const d = new Date(dateRange.to);
    d.setHours(23, 59, 59, 999);
    query = query.lte("start_time", d.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    if (import.meta.env.DEV) console.error("[fetchGps51Trips] Query error:", error);
    throw error;
  }

  const rows = (data || []) as Gps51TripRow[];
  if (import.meta.env.DEV) {
    console.log("[fetchGps51Trips] Received", rows.length, "trips from gps51_trips");
  }

  // No filtering: show exactly what GPS51 querytrips returned and we stored.
  return rows.map(mapGps51TripRowToVehicleTrip);
}



async function fetchVehicleTrips(
  deviceId: string, 
  limit: number = 200,
  dateRange?: TripDateRange
): Promise<VehicleTrip[]> {
  return fetchGps51Trips(deviceId, limit, dateRange);
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

// New: Pre-calculated daily stats from database view
// CRITICAL FIX: Calculate client-side to avoid slow view timeouts
async function fetchVehicleDailyStats(
  deviceId: string,
  daysOrRange: number | TripDateRange = 30
): Promise<VehicleDailyStats[]> {
  // Use fetchVehicleTrips to get raw data
  // Limit to 2000 trips which should be plenty for 30 days (avg ~66 trips/day)
  let startDate: Date;
  let endDate: Date = new Date();
  
  if (typeof daysOrRange === 'number') {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - daysOrRange);
  } else {
    startDate = daysOrRange.from || new Date();
    // Default to today if 'to' is undefined (e.g. single day selection)
    const endDateRaw = daysOrRange.to || daysOrRange.from || new Date();
    endDate = new Date(endDateRaw);
    // Ensure we include the full end date
    endDate.setHours(23, 59, 59, 999);
    
    // If start date is missing in range, default to 30 days ago
    if (!daysOrRange.from) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }
  }
  
  try {
    const trips = await fetchVehicleTrips(deviceId, 2000, {
      from: startDate,
      to: endDate
    });

    // Aggregate trips by day
    const statsMap = new Map<string, VehicleDailyStats>();
    
    trips.forEach(trip => {
      // Use Lagos time for date grouping
      const dateStr = formatLagos(new Date(trip.start_time), "yyyy-MM-dd");
      
      if (!statsMap.has(dateStr)) {
        statsMap.set(dateStr, {
          device_id: deviceId,
        stat_date: dateStr,
        trip_count: 0,
        total_distance_km: 0,
        avg_distance_km: 0,
        peak_speed: 0,
        avg_speed: 0,
        total_duration_seconds: 0,
        first_trip_start: trip.start_time,
        last_trip_end: trip.end_time || trip.start_time
      });
    }
      
      const stat = statsMap.get(dateStr)!;
      stat.trip_count++;
      stat.total_distance_km += trip.distance_km ?? 0;
      stat.total_duration_seconds += (trip.duration_seconds || 0);
      stat.peak_speed = Math.max(stat.peak_speed || 0, trip.max_speed || 0);
      
      // Update first/last times
      if (new Date(trip.start_time) < new Date(stat.first_trip_start)) {
        stat.first_trip_start = trip.start_time;
      }
      const tripEnd = trip.end_time || trip.start_time;
      if (new Date(tripEnd) > new Date(stat.last_trip_end)) {
        stat.last_trip_end = tripEnd;
      }
      
      // Accumulate speed for avg calculation later
      // Storing sum in avg_speed temporarily
      stat.avg_speed = (stat.avg_speed || 0) + (trip.avg_speed || 0);
    });
    
    // Finalize averages
    return Array.from(statsMap.values()).map(stat => ({
      ...stat,
      avg_speed: stat.trip_count > 0 ? (stat.avg_speed || 0) / stat.trip_count : 0,
      // Round numbers
      total_distance_km: Math.round(stat.total_distance_km * 100) / 100,
      avg_distance_km: Math.round((stat.trip_count > 0 ? stat.total_distance_km / stat.trip_count : 0) * 100) / 100,
    })).sort((a, b) => b.stat_date.localeCompare(a.stat_date));
    
  } catch (error) {
    console.error("[fetchVehicleDailyStats] Error calculating stats:", error);
    return [];
  }
}

// ============ Command Execution ============

interface CommandPayload {
  device_id: string;
  command_type: "immobilize_engine" | "demobilize_engine" | "sound_alarm" | "silence_alarm" | "shutdown_engine";
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

export function useVehicleCommand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeVehicleCommand,
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(data.message || "Command sent successfully");
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ["vehicle-events", variables.device_id] });
        queryClient.invalidateQueries({ queryKey: ["vehicle-live-data", variables.device_id] });
      } else {
        toast.error(data.message || "Command failed");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send command");
    },
  });
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
    // CRITICAL: Reduce staleTime for non-live queries to ensure fresh data on navigation
    // Was 24h, now 5 min. Live queries remain 30s.
    staleTime: live ? 30 * 1000 : 5 * 60 * 1000,
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

  // Apply date range filter only if explicitly provided
  // When no dateRange is provided, fetch the most recent events up to the limit (no time restriction)
  if (dateRange?.from) {
    query = query.gte("created_at", dateRange.from.toISOString());
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
  daysOrRange: number | TripDateRange = 30, 
  enabled: boolean = true
) {
  // Create a stable query key dependency based on input type
  const rangeKey = typeof daysOrRange === 'number' 
    ? daysOrRange 
    : `${daysOrRange.from?.toISOString()}_${daysOrRange.to?.toISOString()}`;

  return useQuery({
    queryKey: ["vehicle-daily-stats", deviceId, rangeKey],
    queryFn: () => fetchVehicleDailyStats(deviceId!, daysOrRange),
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
  try {
    let query = (supabase as any)
      .from('vehicle_mileage_details')
      .select('*')
      .eq('device_id', deviceId);

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('statisticsday', startDate);
    }
    
    if (endDate) {
      query = query.lte('statisticsday', endDate);
    }

    const { data, error } = await query
      .order('statisticsday', { ascending: false });

    if (error) {
      // Gracefully handle if table doesn't exist (migration not applied)
      if (error.code === 'PGRST205' || error.message?.includes('Could not find') || error.message?.includes('does not exist')) {
        if (import.meta.env.DEV) {
          console.warn('[fetchVehicleMileageDetails] Table not found, returning empty array:', error.message);
        }
        return [];
      }
      throw error;
    }

    if (import.meta.env.DEV) {
      console.log(`[fetchVehicleMileageDetails] Fetched ${data?.length || 0} mileage records for ${deviceId}`);
    }

    // Map database rows to VehicleMileageDetail interface
    return (data || []).map((row: any): VehicleMileageDetail => ({
      id: row.id,
      device_id: row.device_id,
      statisticsday: row.statisticsday,
      totaldistance: row.totaldistance,
      oilper100km: row.oilper100km,
      runoilper100km: row.runoilper100km,
      oilperhour: row.oilperhour,
      estimated_fuel_consumption_combined: row.estimated_fuel_consumption_combined,
      estimated_fuel_consumption_city: row.estimated_fuel_consumption_city,
      estimated_fuel_consumption_highway: row.estimated_fuel_consumption_highway,
      fuel_consumption_variance: row.fuel_consumption_variance,
      leakoil: row.leakoil,
      totalacc: row.totalacc,
    }));
  } catch (error) {
    // Catch any unexpected errors and return empty array gracefully
    if (import.meta.env.DEV) {
      console.error('[fetchVehicleMileageDetails] Error fetching mileage details:', error);
    }
    return [];
  }
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

    queryClient.prefetchQuery({
      queryKey: ["vehicle-live-data", deviceId],
      queryFn: () => fetchVehicleLiveData(deviceId),
      staleTime: 24 * 60 * 60 * 1000,
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
