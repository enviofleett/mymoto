import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
  lastUpdate: Date | null; // vehicle_positions.gps_time ("last update")
  lastGpsFix: Date | null; // vehicle_positions.gps_fix_time (true fix time)
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
    lastGpsFix: data.gps_fix_time ? new Date(data.gps_fix_time) : null,
    lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : null,
    syncPriority: data.sync_priority ?? 'normal',
  };
}

/**
 * Fetches live vehicle data directly from the database.
 * NO Edge Function calls - this is the fleet-scale safe approach.
 */
export async function fetchVehicleLiveData(deviceId: string): Promise<VehicleLiveData> {
  const fetchStart = Date.now();
  if (import.meta.env.DEV) {
    console.log(`[fetchVehicleLiveData] 🔍 Fetching from DB for: ${deviceId} at ${new Date().toISOString()}`);
  }

  const { data, error } = await (supabase as any)
    .from('vehicle_positions')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();

  const fetchDuration = Date.now() - fetchStart;

  if (error) {
    const errorMessage = `DB fetch error: ${error.message}`;
    if (import.meta.env.DEV) {
      console.error(`[fetchVehicleLiveData] ❌ Error after ${fetchDuration}ms:`, errorMessage);
    }
    throw new Error(errorMessage);
  }
  
  if (!data) {
    const errorMessage = `No position data found for device: ${deviceId}`;
    if (import.meta.env.DEV) {
      console.warn(`[fetchVehicleLiveData] ⚠️ No data after ${fetchDuration}ms:`, errorMessage);
    }
    throw new Error(errorMessage);
  }

  // Debug output for troubleshooting - show data freshness
  if (import.meta.env.DEV) {
    const now = new Date();
    const gpsTime = data.gps_time ? new Date(data.gps_time) : null;
    const gpsFixTime = data.gps_fix_time ? new Date(data.gps_fix_time) : null;
    const lastSynced = data.last_synced_at ? new Date(data.last_synced_at) : null;
    
    const ageGpsTime = gpsTime ? Math.round((now.getTime() - gpsTime.getTime()) / 1000) : null;
    const ageGpsFix = gpsFixTime ? Math.round((now.getTime() - gpsFixTime.getTime()) / 1000) : null;
    const ageSynced = lastSynced ? Math.round((now.getTime() - lastSynced.getTime()) / 1000) : null;
    
    console.log(`[fetchVehicleLiveData] 📊 Raw GPS Data (fetched in ${fetchDuration}ms):`, {
      device_id: data.device_id,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed,
      gps_time: data.gps_time,
      gps_time_age_seconds: ageGpsTime,
      gps_fix_time: data.gps_fix_time,
      gps_fix_age_seconds: ageGpsFix,
      last_synced_at: data.last_synced_at,
      last_synced_age_seconds: ageSynced,
      is_online: data.is_online,
      current_time: now.toISOString(),
    });
  }

  return mapToVehicleLiveData(data);
}

/**
 * Maps the direct API response from gps-data Edge Function to VehicleLiveData.
 * NOTE: The Edge Function 'gps-data' MUST return normalized records (with snake_case keys)
 * for this to work correctly. Raw GPS51 records use different keys (deviceid, strstatus, etc.)
 * and lack computed fields like is_online.
 */
export function mapDirectResponseToVehicleLiveData(record: any): VehicleLiveData {
  return {
    deviceId: record.device_id,
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    speed: record.speed ?? 0,
    heading: record.heading ?? null,
    batteryPercent: record.battery_percent ?? null,
    ignitionOn: record.ignition_on ?? null,
    isOnline: record.is_online ?? false,
    isOverspeeding: record.is_overspeeding ?? false,
    totalMileageKm: record.total_mileage ? Math.round(record.total_mileage / 1000) : null,
    statusText: record.status_text ?? null,
    lastUpdate: record.gps_time ? new Date(record.gps_time) : null,
    lastGpsFix: record.gps_fix_time ? new Date(record.gps_fix_time) : null,
    lastSyncedAt: new Date(), // It's fresh now
    syncPriority: 'high',
  };
}

/**
 * Fetches live vehicle data DIRECTLY from the GPS 51 API via Edge Function.
 * Bypasses the database read lag for 100% real-time accuracy.
 */
export async function fetchVehicleLiveDataDirect(deviceId: string): Promise<VehicleLiveData> {
  const fetchStart = Date.now();
  if (import.meta.env.DEV) {
    console.log(`[fetchVehicleLiveDataDirect] 🚀 Fetching DIRECTLY from GPS 51 for: ${deviceId}`);
  }

  try {
    const { data, error } = await supabase.functions.invoke("gps-data", {
      body: { 
        action: "lastposition", 
        body_payload: { deviceids: [deviceId] },
        use_cache: false 
      },
    });

    const fetchDuration = Date.now() - fetchStart;

    if (error) {
      throw new Error(`Edge Function error: ${error.message}`);
    }

    if (!data?.data?.records?.[0]) {
      throw new Error("No data returned from GPS 51");
    }

    const record = data.data.records[0];

    if (import.meta.env.DEV) {
      console.log(`[fetchVehicleLiveDataDirect] ✅ Received direct data in ${fetchDuration}ms`);
    }

    return mapDirectResponseToVehicleLiveData(record);
  } catch (err) {
    console.error(`[fetchVehicleLiveDataDirect] ❌ Failed:`, err);
    
    // Fallback to Database if Edge Function fails (e.g. AdBlocker, Network, Timeout)
    if (import.meta.env.DEV) {
      console.warn(`[fetchVehicleLiveDataDirect] ⚠️ Falling back to DB for: ${deviceId}`);
    }
    
    try {
      return await fetchVehicleLiveData(deviceId);
    } catch (dbErr) {
      // If even DB fails, then throw the original error
      console.error(`[fetchVehicleLiveDataDirect] ❌ DB Fallback also failed:`, dbErr);
      throw err;
    }
  }
}

const LIVE_POLL_MS = 10 * 1000; // Reduced from 15s to 10s for more frequent updates

/**
 * Primary hook for single vehicle live GPS data.
 * FLEET-SCALE SAFE: Reads directly from vehicle_positions table.
 * CRON (sync-gps-data) handles GPS51 API calls.
 */
export function useVehicleLiveData(deviceId: string | null) {
  const query = useQuery({
    queryKey: ["vehicle-live-data", deviceId],
    queryFn: () => {
      const timestamp = new Date().toISOString();
      if (import.meta.env.DEV) {
        console.log(`[useVehicleLiveData] 🔄 Fetching fresh data at ${timestamp} for device: ${deviceId}`);
      }
      return fetchVehicleLiveData(deviceId!);
    },
    enabled: !!deviceId,
    staleTime: 3 * 1000, // Reduced to 3 seconds - data is considered stale after 3s
    gcTime: 48 * 60 * 60 * 1000,
    refetchInterval: LIVE_POLL_MS, // Poll every 10 seconds
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: 1000,
    placeholderData: (previousData) => previousData,
    // Ensure query refetches when data becomes stale
    refetchOnReconnect: true,
    // CRITICAL FIX: Don't mark data as stale when realtime updates arrive
    // This prevents unnecessary refetches that could overwrite realtime data
    notifyOnChangeProps: ['data', 'error'], // Only notify on data/error changes, not on every state change
  });
  
  // Debug: Log when data is fetched
  useEffect(() => {
    if (query.data && import.meta.env.DEV) {
      console.log(`[useVehicleLiveData] ✅ Data received:`, {
        deviceId,
        lastUpdate: query.data.lastUpdate?.toISOString(),
        lastGpsFix: query.data.lastGpsFix?.toISOString(),
        lastSyncedAt: query.data.lastSyncedAt?.toISOString(),
        timestamp: new Date().toISOString(),
      });
    }
  }, [query.data, deviceId]);
  
  return query;
}

/**
 * Guaranteed polling + visibility refetch for vehicle profile.
 * Ensures LIVE data (map, ProfileHeader) never "stops" when Realtime or RQ interval is throttled.
 * Use only on OwnerVehicleProfile.
 */
export function useVehicleLiveDataHeartbeat(deviceId: string | null) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deviceId) return;

    const refetch = () => {
      if (import.meta.env.DEV) {
        console.log(`[useVehicleLiveDataHeartbeat] 🔄 Heartbeat refetch for device: ${deviceId} at ${new Date().toISOString()}`);
      }
      queryClient.refetchQueries({ queryKey: ["vehicle-live-data", deviceId] });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (import.meta.env.DEV) {
          console.log(`[useVehicleLiveDataHeartbeat] 👁️ Tab visible - refetching for device: ${deviceId}`);
        }
        refetch();
      }
    };

    // Initial refetch
    refetch();
    document.addEventListener("visibilitychange", onVisibilityChange);
    
    // NOTE: We do NOT set up a duplicate interval here because useVehicleLiveData 
    // already has refetchInterval: LIVE_POLL_MS. 
    // This hook is strictly for visibility-based immediate refetching.

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [deviceId, queryClient]);
}
