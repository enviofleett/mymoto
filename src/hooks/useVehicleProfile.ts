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

// ============ Fetch Functions ============

export interface TripDateRange {
  from?: Date;
  to?: Date;
}

async function fetchVehicleTrips(
  deviceId: string, 
  limit: number = 50,
  dateRange?: TripDateRange
): Promise<VehicleTrip[]> {
  let query = (supabase
    .from("vehicle_trips") as any)
    .select("*")
    .eq("device_id", deviceId);

  if (dateRange?.from) {
    query = query.gte("start_time", dateRange.from.toISOString());
  }
  if (dateRange?.to) {
    // Add a day to include the entire "to" date
    const endDate = new Date(dateRange.to);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt("start_time", endDate.toISOString());
  }

  const { data, error } = await query
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as VehicleTrip[];
}

async function fetchVehicleEvents(
  deviceId: string, 
  limit: number = 50,
  dateRange?: TripDateRange
): Promise<VehicleEvent[]> {
  let query = (supabase
    .from("proactive_vehicle_events") as any)
    .select("*")
    .eq("device_id", deviceId);

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
  return (data || []) as VehicleEvent[];
}

async function fetchVehicleLLMSettings(deviceId: string): Promise<VehicleLLMSettings | null> {
  const { data, error } = await (supabase
    .from("vehicle_llm_settings") as any)
    .select("device_id, nickname, language_preference, personality_mode, llm_enabled")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  return data as VehicleLLMSettings | null;
}

async function fetchMileageStats(deviceId: string): Promise<MileageStats> {
  const { data, error } = await (supabase.rpc as any)("get_vehicle_mileage_stats", {
    p_device_id: deviceId,
  });

  if (error) {
    console.error("Error fetching mileage stats:", error);
    return { today: 0, week: 0, month: 0, trips_today: 0, trips_week: 0 };
  }

  return data as unknown as MileageStats;
}

async function fetchDailyMileage(deviceId: string): Promise<DailyMileage[]> {
  const { data, error } = await (supabase.rpc as any)("get_daily_mileage", {
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
  const { data, error } = await (supabase
    .rpc as any)('get_vehicle_daily_stats', {
      p_device_id: deviceId,
      p_days: days
    });

  if (error) {
    // Fallback to direct view query if RPC doesn't exist
    const { data: viewData, error: viewError } = await (supabase
      .from("vehicle_daily_stats") as any)
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
  command_type: "start_engine" | "stop_engine" | "lock_doors" | "unlock_doors";
  confirmed?: boolean;
}

async function executeVehicleCommand(payload: CommandPayload): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke("execute-vehicle-command", {
    body: payload,
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
}

export function useVehicleTrips(
  deviceId: string | null, 
  options: TripFilterOptions = {},
  enabled: boolean = true
) {
  const { dateRange, limit = 50 } = options;
  
  return useQuery({
    queryKey: ["vehicle-trips", deviceId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), limit],
    queryFn: () => fetchVehicleTrips(deviceId!, limit, dateRange),
    enabled: enabled && !!deviceId,
    staleTime: 60 * 1000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000,
  });
}

export interface EventFilterOptions {
  dateRange?: TripDateRange;
  limit?: number;
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
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes (server-calculated)
    gcTime: 10 * 60 * 1000,
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
    queryClient.prefetchQuery({
      queryKey: ["vehicle-trips", deviceId],
      queryFn: () => fetchVehicleTrips(deviceId),
      staleTime: 60 * 1000,
    });

    queryClient.prefetchQuery({
      queryKey: ["vehicle-events", deviceId],
      queryFn: () => fetchVehicleEvents(deviceId),
      staleTime: 30 * 1000,
    });

    queryClient.prefetchQuery({
      queryKey: ["mileage-stats", deviceId],
      queryFn: () => fetchMileageStats(deviceId),
      staleTime: 2 * 60 * 1000,
    });

    queryClient.prefetchQuery({
      queryKey: ["daily-mileage", deviceId],
      queryFn: () => fetchDailyMileage(deviceId),
      staleTime: 2 * 60 * 1000,
    });

    queryClient.prefetchQuery({
      queryKey: ["vehicle-llm-settings", deviceId],
      queryFn: () => fetchVehicleLLMSettings(deviceId),
      staleTime: 5 * 60 * 1000,
    });
    
    // Prefetch vehicle daily stats from view
    queryClient.prefetchQuery({
      queryKey: ["vehicle-daily-stats", deviceId, 30],
      queryFn: () => fetchVehicleDailyStats(deviceId, 30),
      staleTime: 5 * 60 * 1000,
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
