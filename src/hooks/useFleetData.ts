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
  driver?: FleetDriver;
}

export interface FleetMetrics {
  totalVehicles: number;
  movingNow: number;
  assignedDrivers: number;
  avgFleetSpeed: number;
}

export function useFleetData() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [metrics, setMetrics] = useState<FleetMetrics>({
    totalVehicles: 0,
    movingNow: 0,
    assignedDrivers: 0,
    avgFleetSpeed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch GPS data, assignments, and profiles in parallel
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

      if (gpsListResult.error) throw new Error("Failed to fetch vehicle list");
      if (gpsPositionResult.error) throw new Error("Failed to fetch positions");

      const listData = gpsListResult.data;
      const posData = gpsPositionResult.data;
      const assignments = assignmentsResult.data || [];

      if (!listData?.data?.groups) throw new Error("Invalid vehicle list response");

      // Flatten groups to get all devices
      const allDevices = listData.data.groups.flatMap((g: any) => g.devices);

      // Create assignment lookup map
      const assignmentMap = new Map(
        assignments.map((a: any) => [a.device_id, a])
      );

      // Merge all data - FIX: GPS51 API returns callat/callon, not lat/lon
      const mergedVehicles: FleetVehicle[] = allDevices.map((dev: any) => {
        const liveInfo = posData?.data?.records?.find((r: any) => r.deviceid === dev.deviceid);
        const assignment = assignmentMap.get(dev.deviceid);
        const profile = assignment?.profiles;

        // Use callat/callon from GPS51 API (not lat/lon)
        const latitude = liveInfo?.callat || liveInfo?.lat || null;
        const longitude = liveInfo?.callon || liveInfo?.lon || null;
        const speed = liveInfo?.speed || 0;
        
        // Determine status: moving if speed > 0, stopped if has coords but speed 0, offline if no coords
        let status: 'moving' | 'stopped' | 'offline' = 'offline';
        if (latitude && longitude && latitude !== 0 && longitude !== 0) {
          status = speed > 0 ? 'moving' : 'stopped';
        }

        return {
          id: dev.deviceid,
          name: assignment?.vehicle_alias || dev.devicename,
          plate: dev.carplate || "N/A",
          status,
          speed,
          lat: latitude,
          lon: longitude,
          location: (latitude && longitude && latitude !== 0 && longitude !== 0) 
            ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` 
            : "No GPS",
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
      const assignedCount = mergedVehicles.filter(v => v.driver).length;
      const avgSpeed = movingVehicles.length > 0
        ? Math.round(movingVehicles.reduce((sum, v) => sum + v.speed, 0) / movingVehicles.length)
        : 0;

      setMetrics({
        totalVehicles: mergedVehicles.length,
        movingNow: movingVehicles.length,
        assignedDrivers: assignedCount,
        avgFleetSpeed: avgSpeed,
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
  }, [fetchData]);

  return { vehicles, metrics, loading, error, refetch: fetchData };
}
