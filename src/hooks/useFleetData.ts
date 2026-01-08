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

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Calculate offline duration string
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

// Fetch function for fleet data
async function fetchFleetData(): Promise<{ vehicles: FleetVehicle[]; metrics: FleetMetrics }> {
  // Fetch GPS data, assignments, and vehicle metadata in parallel
  const [gpsListResult, gpsPositionResult, assignmentsResult, vehiclesResult] = await Promise.all([
    supabase.functions.invoke('gps-data', {
      body: { action: 'querymonitorlist' }
    }),
    supabase.functions.invoke('gps-data', {
      body: { action: 'lastposition', body_payload: { deviceids: [] } }
    }),
    supabase.from('vehicle_assignments')
      .select(`
        device_id,
        vehicle_alias,
        profile_id,
        profiles (
          id,
          name,
          phone,
          license_number
        )
      `),
    supabase.from('vehicles')
      .select('device_id, gps_owner')
  ]);

  if (gpsListResult.error) throw new Error(gpsListResult.error.message || "Failed to fetch vehicle list");
  if (gpsPositionResult.error) throw new Error(gpsPositionResult.error.message || "Failed to fetch positions");

  const listData = gpsListResult.data;
  const posData = gpsPositionResult.data;
  const assignments = assignmentsResult.data || [];
  const vehiclesMeta = vehiclesResult.data || [];

  // Create vehicle metadata lookup
  const vehicleMetaMap = new Map(
    vehiclesMeta.map((v: any) => [v.device_id, v])
  );

  // Handle cached position data from backend
  let positionRecords = [];
  if (posData?.data?.fromCache) {
    positionRecords = posData.data.records.map((r: any) => ({
      deviceid: r.device_id,
      callat: r.latitude,
      callon: r.longitude,
      speed: r.speed,
      voltagepercent: r.battery_percent,
      strstatus: r.status_text,
      totaldistance: r.total_mileage,
      currentoverspeedstate: r.is_overspeeding ? 1 : 0,
      updatetime: r.gps_time ? new Date(r.gps_time).getTime() : null
    }));
  } else if (posData?.data?.records) {
    positionRecords = posData.data.records;
  }

  if (!listData?.data?.groups) throw new Error("Invalid vehicle list response");

  // Flatten groups to get all devices
  const allDevices = listData.data.groups.flatMap((g: any) => g.devices || []);

  // Create assignment lookup map
  const assignmentMap = new Map(
    assignments.map((a: any) => [a.device_id, a])
  );

  // Merge all data
  const mergedVehicles: FleetVehicle[] = allDevices.map((dev: any) => {
    const liveInfo = positionRecords.find((r: any) => r.deviceid === dev.deviceid);
    const assignment = assignmentMap.get(dev.deviceid);
    const profile = assignment?.profiles;
    const vehicleMeta = vehicleMetaMap.get(dev.deviceid);

    const latitude = liveInfo?.callat ?? null;
    const longitude = liveInfo?.callon ?? null;
    const speed = liveInfo?.speed ?? 0;
    const rawBattery = liveInfo?.voltagepercent;
    const battery = (rawBattery && rawBattery > 0) ? rawBattery : null;
    const mileage = liveInfo?.totaldistance ?? null;
    const isOverspeeding = liveInfo?.currentoverspeedstate === 1;
    
    const strstatus = liveInfo?.strstatus || '';
    const ignition = strstatus.toUpperCase().includes('ACC ON') ? true : 
                     strstatus.toUpperCase().includes('ACC OFF') ? false : null;
    
    let lastUpdate: Date | null = null;
    let vehicleOnline = false;
    let offlineDuration: string | null = null;
    
    if (liveInfo?.updatetime) {
      lastUpdate = new Date(liveInfo.updatetime);
      const diffMs = Date.now() - lastUpdate.getTime();
      vehicleOnline = diffMs < 10 * 60 * 1000;
      if (!vehicleOnline) {
        offlineDuration = getOfflineDuration(lastUpdate);
      }
    }
    
    let status: 'moving' | 'stopped' | 'offline' = 'offline';
    const hasValidCoords = latitude !== null && longitude !== null && latitude !== 0 && longitude !== 0;
    
    if (!vehicleOnline) {
      status = 'offline';
    } else if (hasValidCoords) {
      status = speed > 0 ? 'moving' : 'stopped';
    } else {
      status = 'offline';
    }

    return {
      id: dev.deviceid,
      name: assignment?.vehicle_alias || dev.devicename,
      plate: dev.devicename || "N/A",
      status,
      speed,
      lat: latitude,
      lon: longitude,
      location: hasValidCoords 
        ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` 
        : "No GPS",
      battery,
      ignition,
      lastUpdate,
      offlineDuration,
      mileage,
      isOverspeeding,
      gpsOwner: vehicleMeta?.gps_owner || dev.creater || null,
      driver: profile ? {
        id: profile.id,
        name: profile.name,
        phone: profile.phone,
        license_number: profile.license_number
      } : undefined
    };
  });

  // Calculate metrics
  const movingVehicles = mergedVehicles.filter(v => v.status === 'moving');
  const onlineVehicles = mergedVehicles.filter(v => v.status !== 'offline');
  const assignedCount = mergedVehicles.filter(v => v.driver).length;
  const lowBatteryVehicles = mergedVehicles.filter(v => v.battery !== null && v.battery > 0 && v.battery < 20);
  const overspeedingVehicles = mergedVehicles.filter(v => v.isOverspeeding);
  const avgSpeed = movingVehicles.length > 0
    ? Math.round(movingVehicles.reduce((sum, v) => sum + v.speed, 0) / movingVehicles.length)
    : 0;

  const metrics: FleetMetrics = {
    totalVehicles: mergedVehicles.length,
    movingNow: movingVehicles.length,
    assignedDrivers: assignedCount,
    avgFleetSpeed: avgSpeed,
    onlineCount: onlineVehicles.length,
    lowBatteryCount: lowBatteryVehicles.length,
    overspeedingCount: overspeedingVehicles.length,
  };

  return { vehicles: mergedVehicles, metrics };
}

// Transform realtime payload to partial vehicle update
function transformPayloadToVehicle(payload: any): Partial<FleetVehicle> {
  const speed = payload.speed ?? 0;
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const battery = payload.battery_percent;
  const isOverspeeding = payload.is_overspeeding ?? false;
  
  let lastUpdate: Date | null = null;
  let vehicleOnline = false;
  let offlineDuration: string | null = null;
  
  if (payload.gps_time) {
    lastUpdate = new Date(payload.gps_time);
    const diffMs = Date.now() - lastUpdate.getTime();
    vehicleOnline = diffMs < 10 * 60 * 1000;
    if (!vehicleOnline) {
      offlineDuration = getOfflineDuration(lastUpdate);
    }
  }
  
  const hasValidCoords = latitude !== null && longitude !== null && latitude !== 0 && longitude !== 0;
  let status: 'moving' | 'stopped' | 'offline' = 'offline';
  if (!vehicleOnline) {
    status = 'offline';
  } else if (hasValidCoords) {
    status = speed > 0 ? 'moving' : 'stopped';
  }

  const ignition = payload.ignition_on;

  return {
    speed,
    lat: latitude,
    lon: longitude,
    location: hasValidCoords ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : "No GPS",
    battery: battery && battery > 0 ? battery : null,
    ignition,
    lastUpdate,
    offlineDuration,
    status,
    isOverspeeding,
    mileage: payload.total_mileage ?? null,
  };
}

export function useFleetData() {
  const queryClient = useQueryClient();

  // Use TanStack Query for caching and background refetching
  const { data, isLoading, error, refetch, status } = useQuery({
    queryKey: ['fleet-data'],
    queryFn: fetchFleetData,
    staleTime: 30 * 1000, // Data fresh for 30 seconds - no refetch on mount
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchInterval: 60 * 1000, // Background poll every 60s as fallback
    refetchOnWindowFocus: false, // Don't refetch on tab focus
    retry: 2,
  });

  // Subscribe to realtime updates and update cache directly
  useEffect(() => {
    const channel = supabase
      .channel('vehicle-positions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vehicle_positions'
        },
        (payload) => {
          console.log('Realtime position update:', payload.new.device_id);
          
          // Directly update the specific vehicle in cache - no full refetch
          queryClient.setQueryData(['fleet-data'], (oldData: { vehicles: FleetVehicle[]; metrics: FleetMetrics } | undefined) => {
            if (!oldData) return oldData;
            
            const updatedVehicles = oldData.vehicles.map(vehicle => {
              if (vehicle.id === payload.new.device_id) {
                const updates = transformPayloadToVehicle(payload.new);
                return { ...vehicle, ...updates };
              }
              return vehicle;
            });

            // Recalculate metrics from updated vehicles
            const movingVehicles = updatedVehicles.filter(v => v.status === 'moving');
            const onlineVehicles = updatedVehicles.filter(v => v.status !== 'offline');
            const lowBatteryVehicles = updatedVehicles.filter(v => v.battery !== null && v.battery > 0 && v.battery < 20);
            const overspeedingVehicles = updatedVehicles.filter(v => v.isOverspeeding);
            const avgSpeed = movingVehicles.length > 0
              ? Math.round(movingVehicles.reduce((sum, v) => sum + v.speed, 0) / movingVehicles.length)
              : 0;

            return {
              vehicles: updatedVehicles,
              metrics: {
                ...oldData.metrics,
                movingNow: movingVehicles.length,
                onlineCount: onlineVehicles.length,
                lowBatteryCount: lowBatteryVehicles.length,
                overspeedingCount: overspeedingVehicles.length,
                avgFleetSpeed: avgSpeed,
              }
            };
          });
        }
      )
      .subscribe((subStatus) => {
        console.log('Realtime subscription status:', subStatus);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Derive connection status from query status
  const connectionStatus: ConnectionStatus = useMemo(() => {
    if (status === 'pending') return 'connecting';
    if (status === 'error') return 'disconnected';
    return 'connected';
  }, [status]);

  return { 
    vehicles: data?.vehicles || [], 
    metrics: data?.metrics || {
      totalVehicles: 0,
      movingNow: 0,
      assignedDrivers: 0,
      avgFleetSpeed: 0,
      onlineCount: 0,
      lowBatteryCount: 0,
      overspeedingCount: 0,
    }, 
    loading: isLoading, 
    error: error?.message || null, 
    connectionStatus,
    refetch: () => refetch()
  };
}
