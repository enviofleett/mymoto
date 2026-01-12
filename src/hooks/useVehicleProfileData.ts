import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vehicle LLM settings interface.
 */
export interface VehicleLLMSettings {
  device_id: string;
  nickname: string | null;
  avatar_url: string | null;
  personality_mode: string | null;
  language_preference: string | null;
  llm_enabled: boolean | null;
}

/**
 * Vehicle base info interface.
 */
export interface VehicleInfo {
  device_id: string;
  device_name: string;
  device_type: string | null;
}

/**
 * Combined vehicle profile metadata (non-GPS data).
 * GPS data is now handled by useVehicleLiveData hook.
 */
export interface VehicleProfileData {
  vehicle: VehicleInfo | null;
  llmSettings: VehicleLLMSettings | null;
  displayName: string;
}

/**
 * Fetch vehicle base info.
 */
async function fetchVehicleInfo(deviceId: string): Promise<VehicleInfo | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('device_id, device_name, device_type')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetch LLM settings.
 */
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
 * Hook for vehicle profile METADATA only.
 * 
 * FLEET-SCALE REFACTOR: This hook no longer fetches GPS position data.
 * Use useVehicleLiveData() for live GPS telemetry.
 * 
 * This hook provides:
 * - Vehicle info (name, type)
 * - LLM settings (nickname, avatar, personality)
 * - Display name computation
 * 
 * @param deviceId - Vehicle device ID
 */
export function useVehicleProfileData(deviceId: string | null) {
  // Fetch vehicle info
  const vehicleQuery = useQuery({
    queryKey: ['vehicle-info', deviceId],
    queryFn: () => fetchVehicleInfo(deviceId!),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000, // Vehicle info rarely changes
    gcTime: 10 * 60 * 1000,
  });

  // Fetch LLM settings
  const llmQuery = useQuery({
    queryKey: ['vehicle-llm-settings', deviceId],
    queryFn: () => fetchLLMSettings(deviceId!),
    enabled: !!deviceId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Compute derived values
  const profileData = useMemo<VehicleProfileData>(() => {
    const vehicle = vehicleQuery.data || null;
    const llmSettings = llmQuery.data || null;

    return {
      vehicle,
      llmSettings,
      displayName: llmSettings?.nickname || vehicle?.device_name || 'Vehicle',
    };
  }, [vehicleQuery.data, llmQuery.data]);

  // Refetch metadata
  const refetch = async () => {
    await Promise.all([
      vehicleQuery.refetch(),
      llmQuery.refetch(),
    ]);
  };

  return {
    ...profileData,
    isLoading: vehicleQuery.isLoading,
    isError: vehicleQuery.isError,
    error: vehicleQuery.error,
    refetch,
    refetchLLMSettings: llmQuery.refetch,
  };
}
