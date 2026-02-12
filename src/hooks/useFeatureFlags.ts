import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

async function fetchFeatureFlag(key: string): Promise<FeatureFlagRow | null> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, config")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return (data as FeatureFlagRow) ?? null;
}

/**
 * Returns the global flag (no device allowlist).
 * Defaults to enabled when the flag is missing.
 */
export function useFeatureFlag(flagKey: string) {
  return useQuery({
    queryKey: ["feature-flag", flagKey],
    enabled: !!flagKey,
    staleTime: 60 * 1000, // 1 min
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const flag = await fetchFeatureFlag(flagKey);
      if (!flag) return { enabled: true, config: null as Record<string, unknown> | null };
      return { enabled: !!flag.enabled, config: flag.config ?? null };
    },
  });
}

async function fetchDeviceFlagEnabled(flagKey: string, deviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("feature_flag_devices")
    .select("enabled")
    .eq("flag_key", flagKey)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  return !!data?.enabled;
}

/**
 * Returns TRUE only when:
 * - the global flag exists AND is enabled
 * - and the device is allowlisted (feature_flag_devices row enabled = true)
 *
 * Defaults to false for safety.
 */
export function useDeviceFeatureFlag(flagKey: string, deviceId: string | null) {
  return useQuery({
    queryKey: ["device-feature-flag", flagKey, deviceId],
    enabled: !!deviceId && !!flagKey,
    staleTime: 60 * 1000, // 1 min
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!deviceId) return { enabled: false, config: null as Record<string, unknown> | null };

      const [flag, deviceEnabled] = await Promise.all([
        fetchFeatureFlag(flagKey),
        fetchDeviceFlagEnabled(flagKey, deviceId),
      ]);

      const globalEnabled = !!flag?.enabled;
      return { enabled: globalEnabled && deviceEnabled, config: flag?.config ?? null };
    },
  });
}
