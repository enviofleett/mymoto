import { useState, useEffect, useCallback } from "react";
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

export function useFleetData() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [metrics, setMetrics] = useState<FleetMetrics>({
    totalVehicles: 0,
    movingNow: 0,
    assignedDrivers: 0,
    avgFleetSpeed: 0,
    onlineCount: 0,
    lowBatteryCount: 0,
    overspeedingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch GPS data and trigger backend sync, plus get assignments
      const [gpsListResult, gpsPositionResult, assignmentsResult] = await Promise.all([
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
          `)
      ]);

      if (gpsListResult.error) throw new Error(gpsListResult.error.message || "Failed to fetch vehicle list");
      if (gpsPositionResult.error) throw new Error(gpsPositionResult.error.message || "Failed to fetch positions");

      const listData = gpsListResult.data;
      const posData = gpsPositionResult.data;
      const assignments = assignmentsResult.data || [];

      // Handle cached position data from backend
      let positionRecords = [];
      if (posData?.data?.fromCache) {
        // Data came from cache - transform cached format
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

        // GPS51 API uses callat/callon for calculated coordinates
        const latitude = liveInfo?.callat ?? null;
        const longitude = liveInfo?.callon ?? null;
        const speed = liveInfo?.speed ?? 0;
        const battery = liveInfo?.voltagepercent ?? null;
        const mileage = liveInfo?.totaldistance ?? null;
        const isOverspeeding = liveInfo?.currentoverspeedstate === 1;
        
        // Parse ignition from strstatus
        const strstatus = liveInfo?.strstatus || '';
        const ignition = strstatus.toUpperCase().includes('ACC ON') ? true : 
                         strstatus.toUpperCase().includes('ACC OFF') ? false : null;
        
        // Parse updatetime for online/offline status
        let lastUpdate: Date | null = null;
        let vehicleOnline = false;
        let offlineDuration: string | null = null;
        
        if (liveInfo?.updatetime) {
          lastUpdate = new Date(liveInfo.updatetime);
          const diffMs = Date.now() - lastUpdate.getTime();
          vehicleOnline = diffMs < 10 * 60 * 1000; // 10 minutes
          if (!vehicleOnline) {
            offlineDuration = getOfflineDuration(lastUpdate);
          }
        }
        
        // Determine status based on online state and speed
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
          driver: profile ? {
            id: profile.id,
            name: profile.name,
            phone: profile.phone,
            license_number: profile.license_number
          } : undefined
        };
      });

      setVehicles(mergedVehicles);

      // Calculate metrics
      const movingVehicles = mergedVehicles.filter(v => v.status === 'moving');
      const onlineVehicles = mergedVehicles.filter(v => v.status !== 'offline');
      const assignedCount = mergedVehicles.filter(v => v.driver).length;
      const lowBatteryVehicles = mergedVehicles.filter(v => v.battery !== null && v.battery < 20);
      const overspeedingVehicles = mergedVehicles.filter(v => v.isOverspeeding);
      const avgSpeed = movingVehicles.length > 0
        ? Math.round(movingVehicles.reduce((sum, v) => sum + v.speed, 0) / movingVehicles.length)
        : 0;

      setMetrics({
        totalVehicles: mergedVehicles.length,
        movingNow: movingVehicles.length,
        assignedDrivers: assignedCount,
        avgFleetSpeed: avgSpeed,
        onlineCount: onlineVehicles.length,
        lowBatteryCount: lowBatteryVehicles.length,
        overspeedingCount: overspeedingVehicles.length,
      });

    } catch (err) {
      console.error("Fleet data fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

  return { vehicles, metrics, loading, error, refetch: fetchData };
}
