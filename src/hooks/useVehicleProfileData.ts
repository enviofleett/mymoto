import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VehiclePosition {
  device_id: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  battery_percent: number | null;
  ignition_on: boolean | null;
  is_online: boolean | null;
  total_mileage: number | null;
  gps_time: string | null;
  cached_at: string | null;
}

export interface VehicleLLMSettings {
  device_id: string;
  nickname: string | null;
  avatar_url: string | null;
  personality_mode: string | null;
  language_preference: string | null;
  llm_enabled: boolean | null;
}

export interface VehicleInfo {
  device_id: string;
  device_name: string;
  device_type: string | null;
}

export interface VehicleProfileData {
  vehicle: VehicleInfo | null;
  position: VehiclePosition | null;
  llmSettings: VehicleLLMSettings | null;
  // Computed fields
  displayName: string;
  isOnline: boolean;
  status: 'online' | 'charging' | 'offline';
  lastUpdate: Date | null;
}

// Fetch vehicle base info
async function fetchVehicleInfo(deviceId: string): Promise<VehicleInfo | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('device_id, device_name, device_type')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Fetch vehicle position directly
async function fetchVehiclePosition(deviceId: string): Promise<VehiclePosition | null> {
  const { data, error } = await supabase
    .from('vehicle_positions')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Fetch LLM settings
async function fetchLLMSettings(deviceId: string): Promise<VehicleLLMSettings | null> {
  const { data, error } = await supabase
    .from('vehicle_llm_settings')
    .select('device_id, nickname, avatar_url, personality_mode, language_preference, llm_enabled')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Primary hook for vehicle profile data with real-time updates.
 * Replaces the pattern of using useOwnerVehicles() and filtering.
 */
export function useVehicleProfileData(deviceId: string | null) {
  const queryClient = useQueryClient();

  // Fetch vehicle info
  const vehicleQuery = useQuery({
    queryKey: ['vehicle-info', deviceId],
    queryFn: () => fetchVehicleInfo(deviceId!),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000, // Vehicle info rarely changes
    gcTime: 10 * 60 * 1000,
  });

  // Fetch position
  const positionQuery = useQuery({
    queryKey: ['vehicle-position', deviceId],
    queryFn: () => fetchVehiclePosition(deviceId!),
    enabled: !!deviceId,
    staleTime: 10 * 1000, // Position updates frequently
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000, // Poll every 30 seconds as fallback
  });

  // Fetch LLM settings
  const llmQuery = useQuery({
    queryKey: ['vehicle-llm-settings', deviceId],
    queryFn: () => fetchLLMSettings(deviceId!),
    enabled: !!deviceId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Real-time subscription for instant position updates
  useEffect(() => {
    if (!deviceId) return;

    console.log('[useVehicleProfileData] Setting up real-time subscription for:', deviceId);

    const channel = supabase
      .channel(`vehicle-profile-position-${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_positions',
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          console.log('[useVehicleProfileData] Real-time position update received:', payload.new);
          // Directly update cache with new position data
          if (payload.new && typeof payload.new === 'object') {
            queryClient.setQueryData(['vehicle-position', deviceId], payload.new);
          }
        }
      )
      .subscribe((status) => {
        console.log('[useVehicleProfileData] Subscription status:', status);
      });

    return () => {
      console.log('[useVehicleProfileData] Cleaning up subscription for:', deviceId);
      supabase.removeChannel(channel);
    };
  }, [deviceId, queryClient]);

  // Compute derived values
  const profileData = useMemo<VehicleProfileData>(() => {
    const vehicle = vehicleQuery.data || null;
    const position = positionQuery.data || null;
    const llmSettings = llmQuery.data || null;

    const isOnline = position?.is_online ?? false;
    const isCharging = (position?.battery_percent ?? 100) < (position?.battery_percent ?? 0); // Simplified - actual logic may differ

    return {
      vehicle,
      position,
      llmSettings,
      displayName: llmSettings?.nickname || vehicle?.device_name || 'Vehicle',
      isOnline,
      status: isOnline ? 'online' : 'offline',
      lastUpdate: position?.cached_at ? new Date(position.cached_at) : null,
    };
  }, [vehicleQuery.data, positionQuery.data, llmQuery.data]);

  // Refetch all data
  const refetch = async () => {
    await Promise.all([
      vehicleQuery.refetch(),
      positionQuery.refetch(),
      llmQuery.refetch(),
    ]);
  };

  return {
    ...profileData,
    isLoading: vehicleQuery.isLoading || positionQuery.isLoading,
    isError: vehicleQuery.isError || positionQuery.isError,
    error: vehicleQuery.error || positionQuery.error,
    refetch,
    // Expose individual refetch for targeted updates
    refetchPosition: positionQuery.refetch,
    refetchLLMSettings: llmQuery.refetch,
  };
}
