import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PositionHistory {
  id: string;
  latitude: number;
  longitude: number;
  speed: number;
  battery_percent: number | null;
  ignition_on: boolean | null;
  gps_time: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
}

// Fetch position history for a vehicle
async function fetchPositionHistory(deviceId: string): Promise<PositionHistory[]> {
  const { data, error } = await (supabase as any)
    .from("position_history")
    .select("id, latitude, longitude, speed, battery_percent, ignition_on, gps_time")
    .eq("device_id", deviceId)
    .order("gps_time", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as PositionHistory[]) || [];
}

// Fetch available drivers
async function fetchAvailableDrivers(): Promise<Driver[]> {
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, name, phone")
    .eq("status", "active")
    .order("name");

  if (error) throw error;
  return (data as Driver[]) || [];
}

// Hook for position history with caching
export function usePositionHistory(deviceId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['position-history', deviceId],
    queryFn: () => fetchPositionHistory(deviceId!),
    enabled: enabled && !!deviceId,
    staleTime: 30 * 1000, // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}

// Hook for available drivers with caching
export function useAvailableDrivers(enabled: boolean = true) {
  return useQuery({
    queryKey: ['available-drivers'],
    queryFn: fetchAvailableDrivers,
    enabled,
    staleTime: 60 * 1000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000,
  });
}

// Prefetch function for hover-based prefetching
export function usePrefetchVehicleDetails() {
  const queryClient = useQueryClient();

  const prefetchPositionHistory = (deviceId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['position-history', deviceId],
      queryFn: () => fetchPositionHistory(deviceId),
      staleTime: 30 * 1000,
    });
  };

  const prefetchDrivers = () => {
    queryClient.prefetchQuery({
      queryKey: ['available-drivers'],
      queryFn: fetchAvailableDrivers,
      staleTime: 60 * 1000,
    });
  };

  return { prefetchPositionHistory, prefetchDrivers };
}
