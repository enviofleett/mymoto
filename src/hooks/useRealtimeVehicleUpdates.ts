import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { mapToVehicleLiveData } from './useVehicleLiveData';
import { useDeviceFeatureFlag } from './useFeatureFlags';

export interface RealtimeVehicleUpdatesOptions {
  /** When true, always subscribe regardless of feature flag. Use on vehicle profile for live map updates. */
  forceEnable?: boolean;
}

const REALTIME_RECONNECT_BASE_MS = 1000; // Start with 1 second
const REALTIME_RECONNECT_MAX_MS = 30000; // Max 30 seconds
const REALTIME_MAX_RETRIES = 10; // Prevent infinite loops

/**
 * Real-time vehicle updates hook
 * Subscribes to vehicle position changes and proactive events.
 * Reconnects on CLOSED / CHANNEL_ERROR / TIMED_OUT; resubscribes when tab becomes visible.
 */
export function useRealtimeVehicleUpdates(
  deviceId: string | null,
  options?: RealtimeVehicleUpdatesOptions
) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: realtimeGate } = useDeviceFeatureFlag('realtime_vehicle_positions_enabled', deviceId);
  const fromFlag = realtimeGate?.enabled === true;
  const realtimeEnabled = fromFlag || !!options?.forceEnable;
  const cancelledRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authCheckFailedRef = useRef(false);
  const retryCountRef = useRef(0);
  const currentChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!deviceId || !realtimeEnabled) return;

    cancelledRef.current = false;
    authCheckFailedRef.current = false;
    retryCountRef.current = 0;

    function cleanupChannel() {
      if (currentChannelRef.current) {
        try {
          supabase.removeChannel(currentChannelRef.current);
        } catch {
          /* ignore */
        }
        currentChannelRef.current = null;
      }
    }

    function setupChannel() {
      if (cancelledRef.current || authCheckFailedRef.current) {
        cleanupChannel();
        return;
      }

      // Clean up any existing channel before creating a new one
      cleanupChannel();

      // Reset retry count on successful setup attempt
      if (retryCountRef.current > 0 && import.meta.env.DEV) {
        console.log('[Realtime] Resetting retry count, attempting fresh connection');
      }

      const ch = supabase
        .channel(`vehicle-realtime-${deviceId}`) // Stable channel name (no timestamp)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vehicle_positions',
            filter: `device_id=eq.${deviceId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const timestamp = new Date().toISOString();
            console.log('[Realtime] ⚡ vehicle_positions UPDATE received for', deviceId, {
              lat: payload.new.latitude,
              lng: payload.new.longitude,
              speed: payload.new.speed,
              heading: payload.new.heading,
              timestamp
            });
            
            // Map the payload to VehicleLiveData format
            const mappedData = mapToVehicleLiveData(payload.new);
            
            // CRITICAL FIX: Update cache with new object reference to ensure React Query detects change
            // Create a completely new object to ensure React Query sees it as changed
            const newData: ReturnType<typeof mapToVehicleLiveData> = {
              deviceId: mappedData.deviceId,
              latitude: mappedData.latitude,
              longitude: mappedData.longitude,
              speed: mappedData.speed,
              heading: mappedData.heading,
              batteryPercent: mappedData.batteryPercent,
              ignitionOn: mappedData.ignitionOn,
              isOnline: mappedData.isOnline,
              isOverspeeding: mappedData.isOverspeeding,
              totalMileageKm: mappedData.totalMileageKm,
              statusText: mappedData.statusText,
              lastUpdate: mappedData.lastUpdate,
              lastGpsFix: mappedData.lastGpsFix,
              lastSyncedAt: mappedData.lastSyncedAt,
              syncPriority: mappedData.syncPriority,
            };
            
            console.log('[Realtime] ✅ Updating cache for device', deviceId, {
              latitude: newData.latitude,
              longitude: newData.longitude,
              speed: newData.speed,
              heading: newData.heading,
              timestamp
            });
            
            // Update cache - React Query will automatically notify all subscribers
            // Use exact same query key format as useVehicleLiveData
            queryClient.setQueryData(["vehicle-live-data", deviceId], newData);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'proactive_vehicle_events',
            filter: `device_id=eq.${deviceId}`,
          },
          (payload: { new: { title?: string; message?: string; severity?: string } }) => {
            const e = payload.new;
            if (e.severity === 'critical') toast.error(e.title ?? 'Alert', { description: e.message });
            else if (e.severity === 'warning') toast.warning(e.title ?? 'Warning', { description: e.message });
            else toast.info(e.title ?? 'Info', { description: e.message });
            queryClient.invalidateQueries({ queryKey: ['vehicle-events', deviceId] });
            queryClient.invalidateQueries({ queryKey: ['proactive-events'] });
          }
        )
        .subscribe((status) => {
          if (cancelledRef.current) return;
          
          if (import.meta.env.DEV) {
            console.log('[Realtime] vehicle_positions subscription:', status);
          }
          
          if (status === 'SUBSCRIBED') {
            // Successfully connected - reset retry count
            retryCountRef.current = 0;
            if (import.meta.env.DEV) {
              console.log('[Realtime] LIVE updates active for device', deviceId);
            }
            return;
          }

          if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Prevent multiple simultaneous reconnection attempts
            if (reconnectTimeoutRef.current) {
              if (import.meta.env.DEV) {
                console.log('[Realtime] Reconnection already scheduled, skipping duplicate attempt');
              }
              return;
            }

            // Check max retries to prevent infinite loops
            if (retryCountRef.current >= REALTIME_MAX_RETRIES) {
              console.error('[Realtime] Max retries reached, stopping reconnection attempts');
              authCheckFailedRef.current = true;
              cleanupChannel();
              return;
            }

            if (import.meta.env.DEV) {
              console.warn('[Realtime] Channel down, checking auth before reconnect...');
            }
            
            // ✅ FIX: Check auth session before reconnecting to prevent infinite loop
            supabase.auth.getSession().then(({ data: { session }, error }) => {
              if (cancelledRef.current) return;
              
              if (error || !session) {
                console.error('[Realtime] Auth session invalid, redirecting to login:', error?.message || 'No session');
                authCheckFailedRef.current = true;
                cleanupChannel();
                // Redirect to auth page to break the loop
                navigate('/auth', { replace: true });
                return;
              }
              
              // Auth is valid, proceed with reconnection using exponential backoff
              retryCountRef.current += 1;
              const delay = Math.min(
                REALTIME_RECONNECT_BASE_MS * Math.pow(2, retryCountRef.current - 1),
                REALTIME_RECONNECT_MAX_MS
              );
              
              if (import.meta.env.DEV) {
                console.log(`[Realtime] Auth valid, reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${REALTIME_MAX_RETRIES})`);
              }
              
              // Clean up the failed channel
              cleanupChannel();
              
              // Schedule reconnection with exponential backoff
              reconnectTimeoutRef.current = setTimeout(() => {
                reconnectTimeoutRef.current = null;
                setupChannel();
              }, delay);
            }).catch((err) => {
              console.error('[Realtime] Auth check failed:', err);
              authCheckFailedRef.current = true;
              cleanupChannel();
              navigate('/auth', { replace: true });
            });
          }
        });

      currentChannelRef.current = ch;
    }

    function onVisibilityChange() {
      if (cancelledRef.current || authCheckFailedRef.current || document.visibilityState !== 'visible') return;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Reset retry count when tab becomes visible (user might have fixed network issue)
      retryCountRef.current = 0;
      cleanupChannel();
      setupChannel();
    }

    setupChannel();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      cleanupChannel();
    };
  }, [deviceId, queryClient, realtimeEnabled, navigate]);
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
