import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mapToVehicleLiveData, type VehicleLiveData } from './useVehicleLiveData';

/**
 * Real-time vehicle updates hook
 * Subscribes to vehicle position changes and proactive events
 * Updates React Query cache instantly without refetching
 */
export function useRealtimeVehicleUpdates(deviceId: string | null) {
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasSubscribedRef = useRef(false);

  // Hook entry logging (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Realtime] Hook called with deviceId: ${deviceId}`);
  }

  useEffect(() => {
    console.log(`[Realtime] 🔍 useEffect running for deviceId: ${deviceId}`);
    
    if (!deviceId) {
      console.log(`[Realtime] ❌ Skipping - deviceId is null/undefined`);
      return;
    }

    // Prevent duplicate subscriptions
    if (hasSubscribedRef.current) {
      console.log(`[Realtime] ⚠️ Subscription already exists (hasSubscribedRef.current = true), skipping`);
      return;
    }

    // Mark as subscribing to prevent race conditions
    hasSubscribedRef.current = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    console.log(`[Realtime] 🚀 Setting up subscription for device: ${deviceId}`);
    
    try {
      channel = supabase
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
          // Verify we have the required data
          if (!payload.new || !payload.new.device_id) {
            if (process.env.NODE_ENV === 'development') {
              console.error(`[Realtime] Invalid payload - missing device_id:`, payload);
            }
            return;
          }
          
          // Map raw DB data to the VehicleLiveData interface
          const mappedData = mapToVehicleLiveData(payload.new);
          
          // Update vehicle position cache directly
          // React Query will automatically notify subscribers - no need for invalidation
          queryClient.setQueryData(['vehicle-live-data', deviceId], () => {
            // Always return new object reference to force re-render
            return { ...mappedData };
          });
          
          console.log(`[Realtime] 🔄 Cache updated for ${deviceId}`, {
            timestamp: mappedData.lastUpdate?.toISOString(),
            latitude: mappedData.latitude,
            longitude: mappedData.longitude,
            speed: mappedData.speed
          });
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
      .subscribe((status, err) => {
        console.log(`[Realtime] 📡 Subscription status for ${deviceId}:`, status);
        
        if (err) {
          console.error(`[Realtime] ❌ Subscription error for ${deviceId}:`, err);
        }
        
        // Only set ref if component is still mounted and subscription succeeded
        if (status === 'SUBSCRIBED') {
          subscriptionRef.current = channel;
          console.log(`[Realtime] ✅ Successfully subscribed to vehicle_positions updates for ${deviceId}`);
        } else if (status === 'CHANNEL_ERROR') {
          hasSubscribedRef.current = false;
          console.error(`[Realtime] ❌ CHANNEL_ERROR for ${deviceId}. Realtime may not be enabled for vehicle_positions table.`);
          console.error(`[Realtime] Run this migration: ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;`);
        } else if (status === 'TIMED_OUT') {
          hasSubscribedRef.current = false;
          console.warn(`[Realtime] ⏱️ TIMED_OUT for ${deviceId}`);
        } else if (status === 'CLOSED') {
          hasSubscribedRef.current = false;
          subscriptionRef.current = null;
          console.warn(`[Realtime] 🔴 Subscription CLOSED for ${deviceId}`);
        }
      });

      return () => {
        hasSubscribedRef.current = false;
        if (channel) {
          // Unsubscribe synchronously to prevent race conditions
          try {
            channel.unsubscribe();
          } catch (unsubError) {
            // Ignore errors - channel may already be closed
          }
          
          // Remove channel asynchronously
          supabase.removeChannel(channel).catch(() => {});
          subscriptionRef.current = null;
        }
      };
    } catch (error) {
      hasSubscribedRef.current = false;
      console.error(`[Realtime] Error in useEffect:`, error);
      return () => {};
    }
  }, [deviceId]); // queryClient is stable, no need in deps
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
