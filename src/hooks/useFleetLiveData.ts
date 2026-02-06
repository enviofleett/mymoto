import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FleetDriver {
  id: string;
  name: string;
  phone: string | null;
  license_number: string | null;
}

export interface FleetVehicle {
  id: string;
  name: string;
  plate: string;
  status: 'moving' | 'stopped' | 'offline';
  speed: number;
  lat: number | null;
  lon: number | null;
  location: string;
  battery: number | null;
  ignition: boolean | null;
  lastUpdate: Date | null;
  offlineDuration: string | null;
  mileage: number | null;
  isOverspeeding: boolean;
  gpsOwner: string | null;
  driver?: FleetDriver;
}

export interface FleetMetrics {
  totalVehicles: number;
  movingNow: number;
  assignedDrivers: number;
  avgFleetSpeed: number;
  onlineCount: number;
  lowBatteryCount: number;
  overspeedingCount: number;
}

export interface FleetFilters {
  gpsOwner?: string;
  status?: 'moving' | 'stopped' | 'offline';
  onlyOnline?: boolean;
}

/**
 * Calculate offline duration string from last update time.
 */
function getOfflineDuration(updateTime: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - updateTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

/**
 * Transform database row to FleetVehicle.
 * Status is computed from backend is_online and speed fields.
 */
/**
 * Validate GPS coordinates are within valid ranges
 * - Latitude: -90 to 90
 * - Longitude: -180 to 180
 * - Not null island (0, 0)
 */
function isValidCoordinate(lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null) return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function transformToFleetVehicle(row: any): FleetVehicle {
  const latitude = row.latitude;
  const longitude = row.longitude;
  const speed = row.speed ?? 0;
  const isOnline = row.is_online ?? false;
  const hasValidCoords = isValidCoordinate(latitude, longitude);
  
  // Status is derived from backend is_online field
  let status: 'moving' | 'stopped' | 'offline' = 'offline';
  if (!isOnline) {
    status = 'offline';
  } else if (hasValidCoords) {
    status = speed > 0 ? 'moving' : 'stopped';
  }

  let lastUpdate: Date | null = null;
  let offlineDuration: string | null = null;
  
  if (row.gps_time) {
    lastUpdate = new Date(row.gps_time);
    if (!isOnline) {
      offlineDuration = getOfflineDuration(lastUpdate);
    }
  }

  const assignment = row.vehicle_assignments?.[0];
  const profile = assignment?.profiles;
  const vehicle = row.vehicles;

  // Mileage is stored in meters, convert to km
  const mileageMeters = row.total_mileage;
  const mileageKm = mileageMeters ? Math.round(mileageMeters / 1000) : null;

  return {
    id: row.device_id,
    name: assignment?.vehicle_alias || vehicle?.device_name || row.device_id,
    plate: vehicle?.device_name || "N/A",
    status,
    speed,
    lat: latitude,
    lon: longitude,
    location: hasValidCoords 
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` 
      : "No GPS",
    battery: row.battery_percent && row.battery_percent > 0 ? row.battery_percent : null,
    ignition: row.ignition_on,
    lastUpdate,
    offlineDuration,
    mileage: mileageKm,
    isOverspeeding: row.is_overspeeding ?? false,
    gpsOwner: vehicle?.gps_owner || null,
    driver: profile ? {
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      license_number: profile.license_number
    } : undefined
  };
}

/**
 * Calculate fleet metrics from vehicles array.
 */
function calculateMetrics(vehicles: FleetVehicle[]): FleetMetrics {
  const movingVehicles = vehicles.filter(v => v.status === 'moving');
  const onlineVehicles = vehicles.filter(v => v.status !== 'offline');
  const assignedCount = vehicles.filter(v => v.driver).length;
  const lowBatteryVehicles = vehicles.filter(v => v.battery !== null && v.battery > 0 && v.battery < 20);
  const overspeedingVehicles = vehicles.filter(v => v.isOverspeeding);
  const avgSpeed = movingVehicles.length > 0
    ? Math.round(movingVehicles.reduce((sum, v) => sum + v.speed, 0) / movingVehicles.length)
    : 0;

  return {
    totalVehicles: vehicles.length,
    movingNow: movingVehicles.length,
    assignedDrivers: assignedCount,
    avgFleetSpeed: avgSpeed,
    onlineCount: onlineVehicles.length,
    lowBatteryCount: lowBatteryVehicles.length,
    overspeedingCount: overspeedingVehicles.length,
  };
}

/**
 * Fetch fleet data directly from database.
 * NO Edge Function calls - fleet-scale safe.
 * Uses separate queries for positions and assignments to avoid FK issues.
 */
async function fetchFleetData(): Promise<{ vehicles: FleetVehicle[]; metrics: FleetMetrics }> {
  console.log("[useFleetLiveData] Fetching from DB...");

  // Fetch positions only - no joins to avoid FK issues
  // Filter invalid coordinates at query level (lat -90 to 90, lon -180 to 180, not 0,0)
  let allPositions: any[] = [];
  let posFrom = 0;
  const BATCH_SIZE = 1000;
  let posHasMore = true;

  while (posHasMore) {
    const { data: positions, error: posError } = await (supabase as any)
      .from('vehicle_positions')
      .select(`
        device_id,
        latitude,
        longitude,
        speed,
        heading,
        battery_percent,
        ignition_on,
        is_online,
        is_overspeeding,
        total_mileage,
        status_text,
        gps_time,
        cached_at
      `)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', -90)
      .lte('latitude', 90)
      .gte('longitude', -180)
      .lte('longitude', 180)
      .or('latitude.neq.0,longitude.neq.0') // Not (0,0)
      .range(posFrom, posFrom + BATCH_SIZE - 1);

    if (posError) throw new Error(`Fleet data fetch error: ${posError.message}`);

    if (positions && positions.length > 0) {
      allPositions = [...allPositions, ...positions];
      if (positions.length < BATCH_SIZE) {
        posHasMore = false;
      } else {
        posFrom += BATCH_SIZE;
      }
    } else {
      posHasMore = false;
    }
  }

  // Fetch vehicles separately
  let allVehicles: any[] = [];
  let vehFrom = 0;
  let vehHasMore = true;

  while (vehHasMore) {
    const { data: vehiclesList, error: vehiclesError } = await (supabase as any)
      .from('vehicles')
      .select('device_id, device_name, gps_owner')
      .range(vehFrom, vehFrom + BATCH_SIZE - 1);

    if (vehiclesError) {
      console.warn('[useFleetLiveData] Could not fetch vehicles:', vehiclesError.message);
      vehHasMore = false;
    } else if (vehiclesList && vehiclesList.length > 0) {
      allVehicles = [...allVehicles, ...vehiclesList];
      if (vehiclesList.length < BATCH_SIZE) {
        vehHasMore = false;
      } else {
        vehFrom += BATCH_SIZE;
      }
    } else {
      vehHasMore = false;
    }
  }

  // Fetch assignments with profiles separately
  let allAssignments: any[] = [];
  let assignFrom = 0;
  let assignHasMore = true;

  while (assignHasMore) {
    const { data: assignments, error: assignError } = await (supabase as any)
      .from('vehicle_assignments')
      .select(`
        device_id,
        vehicle_alias,
        profiles (
          id,
          name,
          phone,
          license_number
        )
      `)
      .range(assignFrom, assignFrom + BATCH_SIZE - 1);

    if (assignError) {
      console.warn('[useFleetLiveData] Could not fetch assignments:', assignError.message);
      assignHasMore = false;
    } else if (assignments && assignments.length > 0) {
      allAssignments = [...allAssignments, ...assignments];
      if (assignments.length < BATCH_SIZE) {
        assignHasMore = false;
      } else {
        assignFrom += BATCH_SIZE;
      }
    } else {
      assignHasMore = false;
    }
  }

  // Create lookup maps
  const vehiclesMap = new Map<string, any>();
  allVehicles.forEach(v => vehiclesMap.set(v.device_id, v));

  const assignmentMap = new Map<string, any>();
  allAssignments.forEach(a => assignmentMap.set(a.device_id, a));

  // Merge positions with vehicles and assignments
  const mergedData = allPositions.map(pos => ({
    ...pos,
    vehicles: vehiclesMap.get(pos.device_id) || null,
    vehicle_assignments: assignmentMap.has(pos.device_id) 
      ? [assignmentMap.get(pos.device_id)] 
      : []
  }));

  const vehicles = mergedData.map(transformToFleetVehicle);
  const metrics = calculateMetrics(vehicles);

  console.log(`[useFleetLiveData] Fetched ${vehicles.length} vehicles`);

  return { vehicles, metrics };
}

/**
 * Primary hook for fleet-wide live GPS data.
 * 
 * FLEET-SCALE SAFE: Reads directly from vehicle_positions table with joins.
 * The CRON job (sync-gps-data) handles GPS51 API calls.
 * 
 * @param filters - Optional filters for fleet data
 * @returns Fleet vehicles and metrics with 30-second polling
 */
export function useFleetLiveData(filters?: FleetFilters) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fleet-live-data', filters],
    queryFn: fetchFleetData,
    staleTime: 10 * 1000,       // 10 seconds
    gcTime: 5 * 60 * 1000,      // Keep in cache for 5 minutes
    refetchInterval: 30 * 1000, // Poll DB every 30 seconds
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Subscribe to realtime updates for cache invalidation
  useEffect(() => {
    const channel = supabase
      .channel('fleet-positions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vehicle_positions'
        },
        (payload) => {
          console.log('[useFleetLiveData] Realtime update for:', payload.new.device_id);
          
          // Update specific vehicle in cache without full refetch
          queryClient.setQueryData(['fleet-live-data', filters], (oldData: { vehicles: FleetVehicle[]; metrics: FleetMetrics } | undefined) => {
            if (!oldData) return oldData;
            
            const updatedVehicles = oldData.vehicles.map(vehicle => {
              if (vehicle.id === payload.new.device_id) {
                const row = {
                  ...payload.new,
                  vehicles: { device_name: vehicle.plate, gps_owner: vehicle.gpsOwner },
                  vehicle_assignments: vehicle.driver ? [{
                    vehicle_alias: vehicle.name !== vehicle.plate ? vehicle.name : null,
                    profiles: vehicle.driver
                  }] : []
                };
                return transformToFleetVehicle(row);
              }
              return vehicle;
            });

            return {
              vehicles: updatedVehicles,
              metrics: calculateMetrics(updatedVehicles)
            };
          });
        }
      )
      .subscribe((status) => {
        console.log('[useFleetLiveData] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, filters]);

  // Apply client-side filters if provided
  const filteredData = useMemo(() => {
    if (!data || !filters) return data;

    let vehicles = data.vehicles;

    if (filters.gpsOwner) {
      vehicles = vehicles.filter(v => v.gpsOwner === filters.gpsOwner);
    }
    if (filters.status) {
      vehicles = vehicles.filter(v => v.status === filters.status);
    }
    if (filters.onlyOnline) {
      vehicles = vehicles.filter(v => v.status !== 'offline');
    }

    return {
      vehicles,
      metrics: calculateMetrics(vehicles)
    };
  }, [data, filters]);

  return {
    vehicles: filteredData?.vehicles || [],
    metrics: filteredData?.metrics || {
      totalVehicles: 0,
      movingNow: 0,
      assignedDrivers: 0,
      avgFleetSpeed: 0,
      onlineCount: 0,
      lowBatteryCount: 0,
      overspeedingCount: 0,
    },
    isLoading,
    error: error?.message || null,
    refetch,
  };
}
