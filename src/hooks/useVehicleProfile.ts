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

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate trip quality score for deduplication
// Higher score = better data quality (prefer trips with complete data)
function calculateTripQualityScore(trip: any): number {
  let score = 0;
  
  // Has valid start coordinates (+10 points)
  if (trip.start_latitude && trip.start_longitude && 
      trip.start_latitude !== 0 && trip.start_longitude !== 0) {
    score += 10;
  }
  
  // Has valid end coordinates (+10 points)
  if (trip.end_latitude && trip.end_longitude && 
      trip.end_latitude !== 0 && trip.end_longitude !== 0) {
    score += 10;
  }
  
  // Has non-zero distance (+5 points)
  if (trip.distance_km && trip.distance_km > 0) {
    score += 5;
  }
  
  // Has duration (+3 points)
  if (trip.duration_seconds && trip.duration_seconds > 0) {
    score += 3;
  }
  
  // Has speed data (+2 points)
  if (trip.avg_speed && trip.avg_speed > 0) {
    score += 2;
  }
  
  // Has max speed (+1 point)
  if (trip.max_speed && trip.max_speed > 0) {
    score += 1;
  }
  
  return score;
}

async function fetchVehicleTrips(
  deviceId: string, 
  limit: number = 200,
  dateRange?: TripDateRange
): Promise<VehicleTrip[]> {
  if (process.env.NODE_ENV === 'development') {
    console.log('[fetchVehicleTrips] Fetching trips for device:', deviceId, 'limit:', limit, 'dateRange:', dateRange);
  }
  
  let query = (supabase as any)
    .from("vehicle_trips")
    .select("*")
    .eq("device_id", deviceId)
    // Only require start_time and end_time - coordinates might be missing (0,0) for some trips
    .not("start_time", "is", null)
    .not("end_time", "is", null);

  // FIX: Apply date range filtering only when explicitly provided
  // Do NOT auto-filter to last 24 hours - let limit handle the number of trips
  if (dateRange?.from) {
    // Set to start of day in Africa/Lagos timezone
    const fromDate = new Date(dateRange.from);
    // Use UTC to avoid timezone issues, but set to start of day
    fromDate.setUTCHours(0, 0, 0, 0);
    query = query.gte("start_time", fromDate.toISOString());
    if (process.env.NODE_ENV === 'development') {
      console.log('[fetchVehicleTrips] Date filter FROM:', fromDate.toISOString());
    }
  }
  
  if (dateRange?.to) {
    // Include entire "to" date by setting to end of day (start of next day)
    const endDate = new Date(dateRange.to);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    endDate.setUTCHours(0, 0, 0, 0);
    query = query.lt("start_time", endDate.toISOString());
    if (process.env.NODE_ENV === 'development') {
      console.log('[fetchVehicleTrips] Date filter TO:', endDate.toISOString());
    }
  }
  
  // If no date range provided, fetch most recent trips up to limit
  // This ensures users see all recent trips, not just last 24 hours

  // Always order by start_time DESC to get newest first, then limit
  const { data, error } = await query
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[fetchVehicleTrips] Query error:', error);
    throw error;
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[fetchVehicleTrips] Received', data?.length || 0, 'trips from database');
    
    if (data && data.length > 0) {
      const dates = data.map((t: any) => new Date(t.start_time).toISOString().split('T')[0]);
      const uniqueDates = [...new Set(dates)];
      console.log('[fetchVehicleTrips] Trip date range:', dates[dates.length - 1], 'to', dates[0]);
      console.log('[fetchVehicleTrips] Unique dates found:', uniqueDates.sort().reverse());
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
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[fetchVehicleTrips] After filtering:', {
      before: data?.length || 0,
      after: filteredTrips.length,
      filteredOut: (data?.length || 0) - filteredTrips.length
    });
  }
  
  // FIX: Deduplicate trips - keep only one trip per unique start_time/end_time combination
  // Use a Map to track seen trips, keeping the one with the most complete data
  const tripMap = new Map<string, any>();
  const duplicateIds: string[] = [];
  
  filteredTrips.forEach((trip: any) => {
    // Create a unique key from start_time and end_time
    // Use ISO strings for exact matching (millisecond precision)
    const startTime = trip.start_time ? new Date(trip.start_time).toISOString() : '';
    const endTime = trip.end_time ? new Date(trip.end_time).toISOString() : '';
    
    if (!startTime || !endTime) {
      console.warn(`[fetchVehicleTrips] Skipping trip ${trip.id} with invalid timestamps`);
      return;
    }
    
    const key = `${startTime}|${endTime}`;
    
    const existingTrip = tripMap.get(key);
    
    if (!existingTrip) {
      // First occurrence - add it
      tripMap.set(key, trip);
    } else {
      // Duplicate found - keep the one with better data quality
      const existingScore = calculateTripQualityScore(existingTrip);
      const newScore = calculateTripQualityScore(trip);
      
      if (newScore > existingScore) {
        // New trip has better data - replace
        duplicateIds.push(existingTrip.id);
        tripMap.set(key, trip);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchVehicleTrips] Replacing duplicate trip ${existingTrip.id} with ${trip.id} (better quality: ${newScore} > ${existingScore})`);
        }
      } else if (newScore === existingScore) {
        // Same quality - prefer newer one, or one with ID (more reliable)
        const existingCreated = existingTrip.created_at ? new Date(existingTrip.created_at).getTime() : 0;
        const newCreated = trip.created_at ? new Date(trip.created_at).getTime() : 0;
        
        if (newCreated > existingCreated) {
          duplicateIds.push(existingTrip.id);
          tripMap.set(key, trip);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[fetchVehicleTrips] Replacing duplicate trip ${existingTrip.id} with ${trip.id} (newer: ${new Date(trip.created_at).toISOString()} > ${new Date(existingTrip.created_at).toISOString()})`);
          }
        } else {
          duplicateIds.push(trip.id);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[fetchVehicleTrips] Skipping duplicate trip ${trip.id} (keeping ${existingTrip.id}, same quality, older)`);
          }
        }
      } else {
        // Existing trip is better - keep it
        duplicateIds.push(trip.id);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchVehicleTrips] Skipping duplicate trip ${trip.id} (keeping ${existingTrip.id}, better quality: ${existingScore} > ${newScore})`);
        }
      }
    }
  });
  
  const deduplicatedTrips = Array.from(tripMap.values());
  
  if (deduplicatedTrips.length < filteredTrips.length && process.env.NODE_ENV === 'development') {
    const duplicatesRemoved = filteredTrips.length - deduplicatedTrips.length;
    console.log(`[fetchVehicleTrips] Removed ${duplicatesRemoved} duplicate trip(s) for device ${deviceId} (${filteredTrips.length} -> ${deduplicatedTrips.length})`);
  }
  
  return deduplicatedTrips
    .map((trip: any): VehicleTrip => {
      // FIX: Improved distance calculation - handle NULL, 0, and missing values
      let distanceKm = trip.distance_km;
      
      // Convert NULL to 0 for easier handling
      if (distanceKm === null || distanceKm === undefined) {
        distanceKm = 0;
      }
      
      // Check if we need to calculate distance
      const needsDistanceCalculation = distanceKm === 0 || distanceKm === null;
      
      // First, try to calculate from GPS coordinates if available
      const hasValidStartCoords = trip.start_latitude != null && trip.start_longitude != null && 
                                   trip.start_latitude !== 0 && trip.start_longitude !== 0;
      const hasValidEndCoords = trip.end_latitude != null && trip.end_longitude != null && 
                                 trip.end_latitude !== 0 && trip.end_longitude !== 0;
      
      if (needsDistanceCalculation && hasValidStartCoords && hasValidEndCoords) {
        // Calculate distance using Haversine formula
        distanceKm = calculateDistance(
          trip.start_latitude,
          trip.start_longitude,
          trip.end_latitude,
          trip.end_longitude
        );
        
        if (process.env.NODE_ENV === 'development' && distanceKm > 0) {
          console.log(`[fetchVehicleTrips] Calculated distance for trip ${trip.id}: ${distanceKm.toFixed(2)} km`);
        }
      }
      
      // If distance is still 0 but we have duration and average speed, estimate distance
      if (distanceKm === 0 && trip.duration_seconds && trip.avg_speed && trip.avg_speed > 0) {
        // distance = speed (km/h) * time (hours)
        const durationHours = trip.duration_seconds / 3600;
        distanceKm = trip.avg_speed * durationHours;
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchVehicleTrips] Estimated distance from speed for trip ${trip.id}: ${distanceKm.toFixed(2)} km`);
        }
      }
      
      // If distance is still 0 but we have duration, estimate minimum distance
      // Assume minimum speed of 5 km/h for any trip with duration
      if (distanceKm === 0 && trip.duration_seconds && trip.duration_seconds > 0) {
        const durationHours = trip.duration_seconds / 3600;
        const minSpeedKmh = 5; // Minimum assumed speed for a trip
        distanceKm = minSpeedKmh * durationHours;
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchVehicleTrips] Estimated minimum distance for trip ${trip.id}: ${distanceKm.toFixed(2)} km`);
        }
      }

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
    .select("device_id, nickname, language_preference, personality_mode, llm_enabled, avatar_url")
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
}

export function useVehicleTrips(
  deviceId: string | null, 
  options: TripFilterOptions = {},
  enabled: boolean = true
) {
  const { dateRange, limit = 200 } = options; // Increased default limit from 50 to 200
  
  return useQuery({
    queryKey: ["vehicle-trips", deviceId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), limit],
    queryFn: () => fetchVehicleTrips(deviceId!, limit, dateRange),
    enabled: enabled && !!deviceId,
    staleTime: 24 * 60 * 60 * 1000, // Fresh for 24 hours (data from last 24h loads instantly)
    gcTime: 48 * 60 * 60 * 1000, // Keep in cache for 48 hours
    // Refetch on window focus to ensure latest trips are shown
    refetchOnWindowFocus: true,
    // Refetch on reconnect to get latest trips
    refetchOnReconnect: true,
    // Use placeholderData to show cached data instantly while fresh data loads
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
  let query = (supabase as any)
    .from("vehicle_mileage_details")
    .select("*")
    .eq("device_id", deviceId)
    .order("statisticsday", { ascending: false });

  if (startDate) {
    query = query.gte("statisticsday", startDate);
  }
  if (endDate) {
    query = query.lte("statisticsday", endDate);
  }

  const { data, error } = await query;

  if (error) {
    // Table doesn't exist yet (migration not applied) - return empty array gracefully
    // Check for various error codes and messages that indicate missing table
    if (
      error.code === 'PGRST116' || // PostgREST relation not found
      error.code === 'PGRST205' || // PostgREST table not found
      error.message?.includes('404') ||
      error.message?.includes('Could not find the table') ||
      error.message?.includes('relation') ||
      error.message?.includes('does not exist') ||
      error.message?.includes('not found')
    ) {
      console.warn("vehicle_mileage_details table not found - migration may not be applied yet. Returning empty array.");
      return [];
    }
    console.error("Error fetching mileage details:", error);
    throw error;
  }

  return (data || []) as VehicleMileageDetail[];
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
