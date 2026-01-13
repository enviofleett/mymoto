import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fleet-scale safe live vehicle data interface.
 * All data comes from the database - no Edge Function calls.
 */
export interface VehicleLiveData {
  deviceId: string;
  latitude: number | null;
  longitude: number | null;
  speed: number;
  heading: number | null;
  batteryPercent: number | null;
  ignitionOn: boolean | null;
  isOnline: boolean;
  isOverspeeding: boolean;
  totalMileageKm: number | null;
  statusText: string | null;
  lastUpdate: Date | null;
  lastSyncedAt: Date | null;
  syncPriority: 'high' | 'normal' | 'low';
}

/**
 * Maps database row to VehicleLiveData interface.
 * Handles mileage conversion (meters to km) and type normalization.
 */
export function mapToVehicleLiveData(data: any): VehicleLiveData {
  // Mileage is stored in meters, convert to km
  const mileageMeters = data.total_mileage;
  const mileageKm = mileageMeters ? Math.round(mileageMeters / 1000) : null;

  return {
    deviceId: data.device_id,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    speed: data.speed ?? 0,
    heading: data.heading ?? null,
    batteryPercent: data.battery_percent ?? null,
    ignitionOn: data.ignition_on ?? null,
    isOnline: data.is_online ?? false,
    isOverspeeding: data.is_overspeeding ?? false,
    totalMileageKm: mileageKm,
    statusText: data.status_text ?? null,
    lastUpdate: data.gps_time ? new Date(data.gps_time) : null,
    lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : null,
    syncPriority: data.sync_priority ?? 'normal',
  };
}

/**
 * Fetches live vehicle data directly from the database.
 * NO Edge Function calls - this is the fleet-scale safe approach.
 */
async function fetchVehicleLiveData(deviceId: string): Promise<VehicleLiveData> {
  if (process.env.NODE_ENV === 'development') {
    console.log("[useVehicleLiveData] Fetching from DB for:", deviceId);
  }

  const { data, error } = await (supabase as any)
    .from('vehicle_positions')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    const errorMessage = `DB fetch error: ${error.message}`;
    if (process.env.NODE_ENV === 'development') {
      console.error("[useVehicleLiveData] Error:", errorMessage);
    }
    throw new Error(errorMessage);
  }
  
  if (!data) {
    const errorMessage = `No position data found for device: ${deviceId}`;
    if (process.env.NODE_ENV === 'development') {
      console.warn("[useVehicleLiveData] No data:", errorMessage);
    }
    throw new Error(errorMessage);
  }

  // Debug output for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log("[useVehicleLiveData] Raw GPS Data:", data);
  }

  return mapToVehicleLiveData(data);
}

/**
 * Primary hook for single vehicle live GPS data.
 * * FLEET-SCALE SAFE: Reads directly from vehicle_positions table.
 * The CRON job (sync-gps-data) handles GPS51 API calls.
 * * @param deviceId - Vehicle device ID
 * @returns Live telemetry data with 15-second polling
 */
export function useVehicleLiveData(deviceId: string | null) {
  return useQuery({
    queryKey: ['vehicle-live-data', deviceId],
    queryFn: () => fetchVehicleLiveData(deviceId!),
    enabled: !!deviceId,
    staleTime: 5 * 1000,        // Data stale after 5 seconds
    gcTime: 60 * 1000,          // Keep in cache for 1 minute
    refetchInterval: 15 * 1000, // Poll DB every 15 seconds
    retry: 2,
    retryDelay: 1000,
  });
}
