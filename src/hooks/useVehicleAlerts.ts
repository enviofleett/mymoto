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
    queryKey: ['vehicle-alerts', deviceId, limit],
    queryFn: async () => {
      if (!deviceId) return [];

      const { data, error } = await (supabase
        .from('proactive_vehicle_events' as any)
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(limit) as any);

      if (error) throw error;
      return (data || []) as VehicleAlert[];
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
  
  return message;
}
