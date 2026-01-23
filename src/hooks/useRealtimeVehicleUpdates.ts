import { useEffect, useLayoutEffect } from 'react';
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

  // DEBUG: Log hook entry
  console.log(`[Realtime] 🔵 Hook called with deviceId: ${deviceId}, type: ${typeof deviceId}, truthy: ${!!deviceId}`);
  console.log(`[Realtime] 🔵 About to call useEffect, queryClient:`, !!queryClient);
  console.log(`[Realtime] 🔵 useEffect function exists:`, typeof useEffect === 'function');
  console.log(`[Realtime] 🔵 useLayoutEffect function exists:`, typeof useLayoutEffect === 'function');

  // Try useLayoutEffect first (runs synchronously)
  useLayoutEffect(() => {
    console.log(`[Realtime] 🔵✅✅✅ useLayoutEffect RUNNING NOW (SYNC), deviceId: ${deviceId}, type: ${typeof deviceId}`);
    console.log(`[Realtime] 🔵✅✅✅ useLayoutEffect timestamp:`, new Date().toISOString());
    console.trace(`[Realtime] useLayoutEffect call stack:`);
    
    if (!deviceId) {
      console.log(`[Realtime] ⚠️ Skipping subscription - deviceId is null/undefined`);
      return;
    }

    console.log(`[Realtime] 🔵 Setting up subscription for device: ${deviceId} (from useLayoutEffect)`);

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
          console.log(`[Realtime] Position update received for ${deviceId}:`, {
            event: payload.eventType,
            new: payload.new,
            old: payload.old,
            timestamp: new Date().toISOString()
          });
          
          // Verify we have the required data
          if (!payload.new || !payload.new.device_id) {
            console.error(`[Realtime] Invalid payload - missing device_id:`, payload);
            return;
          }
          
          // Check if REPLICA IDENTITY is FULL (we need all columns)
          if (!payload.new.latitude && !payload.new.longitude && !payload.new.gps_time) {
            console.warn(`[Realtime] Payload missing location data. REPLICA IDENTITY might not be FULL.`, payload.new);
            console.warn(`[Realtime] Run: ALTER TABLE vehicle_positions REPLICA IDENTITY FULL;`);
            // Still try to update with what we have
          }
          
          // Map raw DB data to the VehicleLiveData interface
          const mappedData = mapToVehicleLiveData(payload.new);
          
          console.log(`[Realtime] Mapped data:`, {
            deviceId: mappedData.deviceId,
            latitude: mappedData.latitude,
            longitude: mappedData.longitude,
            lastUpdate: mappedData.lastUpdate,
            speed: mappedData.speed
          });
          
          // Update vehicle position cache directly
          // This matches the key used in useVehicleLiveData
          queryClient.setQueryData(['vehicle-live-data', deviceId], mappedData);
          
          // Force a refetch to ensure UI updates
          queryClient.invalidateQueries({ queryKey: ['vehicle-live-data', deviceId] });
          
          console.log(`[Realtime] ✅ Cache updated and invalidated for ${deviceId}`);
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
      .subscribe((status) => {
        console.log(`[Realtime] 📡 Subscription status for ${deviceId}:`, status);
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] ✅ Successfully subscribed to vehicle_positions updates for ${deviceId}`);
          console.log(`[Realtime] 🎯 Waiting for position updates...`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[Realtime] ❌ Channel error for ${deviceId}. Realtime may not be enabled for vehicle_positions table.`);
          console.error(`[Realtime] Run this migration: ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;`);
        } else if (status === 'TIMED_OUT') {
          console.warn(`[Realtime] ⚠️ Subscription timed out for ${deviceId}`);
        } else if (status === 'CLOSED') {
          console.warn(`[Realtime] ⚠️ Subscription closed for ${deviceId}`);
        } else {
          console.log(`[Realtime] ℹ️ Subscription status: ${status} for ${deviceId}`);
        }
      });

    return () => {
      console.log(`[Realtime] Cleaning up subscription for ${deviceId}`);
      supabase.removeChannel(channel);
    };
  }, [deviceId, queryClient]);
  
  // DEBUG: Log after useLayoutEffect call
  console.log(`[Realtime] 🔵 useLayoutEffect call completed (effect will run synchronously after render)`);
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
