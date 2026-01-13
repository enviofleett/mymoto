import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapToVehicleLiveData } from './useVehicleLiveData';

/**
 * Real-time vehicle updates hook
 * Subscribes to vehicle position changes and proactive events
 * Updates React Query cache instantly without refetching
 */
export function useRealtimeVehicleUpdates(deviceId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!deviceId) return;

    const channel = supabase
      .channel(`vehicle-realtime-${deviceId}`)
      // Position updates - instant map/stats refresh
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'vehicle_positions', 
          filter: `device_id=eq.${deviceId}` 
        },
        (payload) => {
          // Map raw DB data to the VehicleLiveData interface
          const mappedData = mapToVehicleLiveData(payload.new);
          
          // Update vehicle position cache directly
          // This matches the key used in useVehicleLiveData
          queryClient.setQueryData(['vehicle-live-data', deviceId], mappedData);
        }
      )
      // New events (alerts) - show toast notification
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'proactive_vehicle_events', 
          filter: `device_id=eq.${deviceId}` 
        },
        (payload) => {
          const event = payload.new as {
            title: string;
            message: string;
            severity: string;
            event_type: string;
          };
          
          // Show appropriate toast based on severity
          if (event.severity === 'critical') {
            toast.error(event.title, { description: event.message });
          } else if (event.severity === 'warning') {
            toast.warning(event.title, { description: event.message });
          } else {
            toast.info(event.title, { description: event.message });
          }
          
          // Refresh events list
          queryClient.invalidateQueries({ queryKey: ['vehicle-events', deviceId] });
          queryClient.invalidateQueries({ queryKey: ['proactive-events'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, queryClient]);
}

/**
 * Real-time updates for multiple vehicles
 * Useful for fleet-wide monitoring
 */
export function useRealtimeFleetUpdates(deviceIds: string[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!deviceIds.length) return;

    const channel = supabase
      .channel('fleet-realtime-updates')
      // Position updates for all fleet vehicles
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'vehicle_positions'
        },
        (payload) => {
          const newData = payload.new as { device_id: string };
          if (deviceIds.includes(newData.device_id)) {
            queryClient.invalidateQueries({ queryKey: ['fleet-data'] });
          }
        }
      )
      // New events for any fleet vehicle
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'proactive_vehicle_events'
        },
        (payload) => {
          const event = payload.new as { 
            device_id: string;
            title: string;
            message: string;
            severity: string;
          };
          
          if (deviceIds.includes(event.device_id)) {
            // Show toast for fleet vehicle alerts
            if (event.severity === 'critical') {
              toast.error(event.title, { description: event.message });
            } else if (event.severity === 'warning') {
              toast.warning(event.title, { description: event.message });
            }
            
            queryClient.invalidateQueries({ queryKey: ['vehicle-events'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceIds, queryClient]);
}
