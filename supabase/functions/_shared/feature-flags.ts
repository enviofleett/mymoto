export async function getFeatureFlag(
  supabase: any,
  key: string
): Promise<{ enabled: boolean; config: Record<string, unknown> | null }> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled, config')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    // Safety: if flags table is missing or RLS blocks it, default OFF.
    console.warn('[feature-flags] failed to read feature_flags:', error);
    return { enabled: false, config: null };
  }

  return { enabled: !!data?.enabled, config: (data?.config as any) ?? null };
}

export async function isDeviceAllowlisted(
  supabase: any,
  flagKey: string,
  deviceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('feature_flag_devices')
    .select('enabled')
    .eq('flag_key', flagKey)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) {
    console.warn('[feature-flags] failed to read feature_flag_devices:', error);
    return false;
  }

  return !!data?.enabled;
}

export async function isDeviceFeatureEnabled(
  supabase: any,
  flagKey: string,
  deviceId: string
): Promise<boolean> {
  const [{ enabled }, allowlisted] = await Promise.all([
    getFeatureFlag(supabase, flagKey),
    isDeviceAllowlisted(supabase, flagKey, deviceId),
  ]);

  return enabled && allowlisted;
}

