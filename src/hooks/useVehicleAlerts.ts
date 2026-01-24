import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleAlert {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metadata: {
    latitude?: number;
    longitude?: number;
    address?: string;
    speed?: number;
    battery_percent?: number;
    [key: string]: unknown;
  };
  created_at: string;
  acknowledged: boolean;
}

export function useVehicleAlerts(deviceId: string | null, limit = 10) {
  return useQuery({
    queryKey: ['gps51-alarms', deviceId, limit],
    queryFn: async () => {
      if (!deviceId) return [];

      // Fetch alarms DIRECTLY from GPS51 data (gps51_alarms table)
      // This ensures 100% match with GPS51 platform
      const { data, error } = await (supabase as any)
        .from('gps51_alarms')
        .select('*')
        .eq('device_id', deviceId)
        .order('alarm_time', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Transform GPS51 alarms to VehicleAlert interface
      const alerts: VehicleAlert[] = (data || []).map((alarm: any) => ({
        id: alarm.id,
        device_id: alarm.device_id,
        event_type: 'gps51_alarm',
        severity: alarm.severity,
        title: alarm.alarm_description_en || alarm.alarm_description || 'GPS51 Alarm',
        message: alarm.alarm_description_en || alarm.alarm_description || `Alarm code: ${alarm.alarm_code}`,
        metadata: {
          latitude: alarm.latitude,
          longitude: alarm.longitude,
          speed: alarm.speed_kmh,
          alarm_code: alarm.alarm_code,
          heading: alarm.heading,
          altitude: alarm.altitude,
        },
        created_at: alarm.alarm_time,
        acknowledged: alarm.acknowledged,
      }));

      return alerts;
    },
    enabled: !!deviceId,
    staleTime: 30000,
  });
}

export function formatAlertForChat(alert: VehicleAlert): string {
  const hasLocation = alert.metadata?.latitude && alert.metadata?.longitude;
  const address = alert.metadata?.address || 'Unknown location';

  let message = `🚨 **${alert.title}**\n${alert.message}`;

  if (hasLocation) {
    message += `\n\n[LOCATION: ${alert.metadata.latitude}, ${alert.metadata.longitude}, "${address}"]`;
  }

  // Add GPS51 alarm code if available
  if (alert.metadata?.alarm_code) {
    message += `\nAlarm Code: ${alert.metadata.alarm_code}`;
  }

  return message;
}
