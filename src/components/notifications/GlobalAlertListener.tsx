import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationPreferences, type AlertType, type SeverityLevel } from "@/hooks/useNotificationPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { NotificationToast } from "@/components/notifications/NotificationToast";

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  acknowledged: boolean;
}

/**
 * GlobalAlertListener - Invisible component that subscribes to real-time
 * proactive_vehicle_events and triggers notifications app-wide.
 * 
 * This component should be mounted once at the app layout level.
 * It handles:
 * - Supabase Realtime subscription to proactive_vehicle_events
 * - Sound alerts based on severity and user preferences
 * - Browser push notifications
 * - Email notifications for critical/error events
 * - Toast notifications for in-app feedback
 */
export function GlobalAlertListener() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showNotification, playAlertSound, permission } = useNotifications();
  const { shouldPlaySound, shouldShowPush, preferences } = useNotificationPreferences();
  const { user, isAdmin } = useAuth();
  const { data: ownerVehicles } = useOwnerVehicles();
  const authRedirectedRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const ignoredDeviceLogRef = useRef<Set<string>>(new Set());
  const MAX_DEVICE_CHANNELS = 25;
  
  // Get list of device IDs for user's assigned vehicles
  const userDeviceIds = ownerVehicles?.map(v => v.deviceId) || [];
  const userDeviceIdsKey = userDeviceIds.join(",");

  // ✅ FIX: Vibration patterns by severity (for Android locked screens)
  const getVibrationPattern = useCallback((severity: SeverityLevel): number[] => {
    switch (severity) {
      case 'info':
        return [200]; // Single short vibration
      case 'warning':
        return [200, 100, 200]; // Two vibrations
      case 'error':
        return [200, 100, 200, 100, 200]; // Three vibrations
      case 'critical':
        return [300, 100, 300, 100, 300, 100, 300]; // Four long vibrations
      default:
        return [200]; // Default single vibration
    }
  }, []);

  // Send email notification for critical/error events
  const sendEmailNotification = useCallback(async (event: ProactiveEvent) => {
    if (event.severity !== 'critical' && event.severity !== 'error') {
      return;
    }

    try {
      console.log(`[GlobalAlertListener] Sending email for ${event.severity} event: ${event.title}`);
      
      await supabase.functions.invoke('send-alert-email', {
        body: {
          eventId: event.id,
          deviceId: event.device_id,
          eventType: event.event_type,
          severity: event.severity,
          title: event.title,
          message: event.message,
          metadata: event.metadata
        }
      });
    } catch (err) {
      console.error('[GlobalAlertListener] Email notification error:', err);
    }
  }, []);

  // Normalize event type to match notification preference keys
  const normalizeEventType = useCallback((eventType: string): AlertType => {
    // Map database event types to notification preference keys
    const typeMap: Record<string, AlertType> = {
      'ignition_off': 'ignition_off', // Keep for compatibility
      'power_off': 'ignition_off',     // Map power_off alias to ignition_off
      'ignition_on': 'ignition_on',
      'vehicle_moving': 'vehicle_moving',
      'overspeeding': 'overspeeding',
      'low_battery': 'low_battery',
      'critical_battery': 'critical_battery',
      'harsh_braking': 'harsh_braking',
      'rapid_acceleration': 'rapid_acceleration',
      'geofence_enter': 'geofence_enter',
      'geofence_exit': 'geofence_exit',
      'idle_too_long': 'idle_too_long',
      'offline': 'offline',
      'online': 'online',
    };
    
    return (typeMap[eventType] || eventType) as AlertType;
  }, []);

  // Handle new event from realtime subscription
  const handleNewEvent = useCallback((event: ProactiveEvent) => {
    // CRITICAL: Filter by user's vehicle assignments
    // Admins see all events, regular users only see events for their vehicles
    if (!isAdmin && !userDeviceIds.includes(event.device_id)) {
      if (import.meta.env.DEV && !ignoredDeviceLogRef.current.has(event.device_id)) {
        ignoredDeviceLogRef.current.add(event.device_id);
        console.log('[GlobalAlertListener] Ignoring alert for unassigned vehicle:', event.device_id);
      }
      return;
    }

    // Dedupe popups by event id (reconnect/resubscribe can re-deliver).
    if (seenEventIdsRef.current.has(event.id)) {
      return;
    }
    seenEventIdsRef.current.add(event.id);
    if (seenEventIdsRef.current.size > 1000) {
      // Avoid unbounded growth: best-effort, we only need short-term dedupe.
      seenEventIdsRef.current.clear();
      seenEventIdsRef.current.add(event.id);
    }

    console.log('[GlobalAlertListener] New alert for user vehicle:', event.event_type, event.severity, event.device_id);

    // Normalize event type to match notification preferences
    const alertType = normalizeEventType(event.event_type) as AlertType;
    const severity = event.severity as SeverityLevel;

    // Play sound based on preferences
    if (shouldPlaySound(alertType, severity)) {
      playAlertSound(severity, preferences.soundVolume);
    }

    // Show custom toast for all relevant alerts
    if (['critical', 'error', 'warning'].includes(severity) || shouldShowPush(alertType, severity)) {
      let dismissToast = () => {};
      const t = toast({
        // @ts-ignore - Custom component support in sonner
        action: (
          <NotificationToast
            title={event.title}
            message={event.message}
            type={severity === 'info' ? 'success' : severity as any} // Map info to success style if desired, or keep info
            onClick={() => {
              navigate(`/notifications?eventId=${encodeURIComponent(event.id)}&deviceId=${encodeURIComponent(event.device_id)}`);
              dismissToast();
            }}
          />
        ),
        duration: severity === 'critical' ? 10000 : 5000,
        className: "p-0 bg-transparent border-none shadow-none", // Remove default toast styling
      });
      dismissToast = t.dismiss;
    }

    // Trigger email for critical/error
    if (severity === 'critical' || severity === 'error') {
      sendEmailNotification(event);
    }

    // Show push notification based on preferences
    if (permission === 'granted' && shouldShowPush(alertType, severity)) {
      showNotification({
        title: severity === 'critical' ? `🚨 ${event.title}` : event.title,
        body: event.message,
        tag: `alert-${event.id}`,
        requireInteraction: severity === 'critical',
        // ✅ FIX: Locked screen support
        silent: false, // CRITICAL: Enables system sound on locked screens
        vibrate: getVibrationPattern(severity), // Severity-based vibration patterns
        renotify: true, // Re-alert even if same tag exists
        timestamp: Date.now(), // Proper notification sorting
        data: {
          eventId: event.id,
          deviceId: event.device_id,
          eventType: event.event_type
        }
      });
    }
  }, [toast, playAlertSound, showNotification, permission, shouldPlaySound, shouldShowPush, preferences.soundVolume, sendEmailNotification, isAdmin, userDeviceIds, getVibrationPattern, normalizeEventType]);

  // Use ref to store the latest handleNewEvent to avoid re-subscribing
  const handleNewEventRef = useRef(handleNewEvent);
  useEffect(() => {
    handleNewEventRef.current = handleNewEvent;
  }, [handleNewEvent]);

  // Robust subscription with retry logic
  useEffect(() => {
    if (!user) {
      if (import.meta.env.DEV) {
        console.log('[GlobalAlertListener] No user, skipping realtime subscription');
      }
      return;
    }

    if (!isAdmin && userDeviceIds.length === 0) {
      if (import.meta.env.DEV) {
        console.log('[GlobalAlertListener] No assigned vehicles, skipping realtime subscription');
      }
      return;
    }

    authRedirectedRef.current = false;
    let channels: Array<ReturnType<typeof supabase.channel>> = [];
    let retryTimeout: NodeJS.Timeout | undefined;
    let retryCount = 0;

    const setupSubscription = () => {
      if (import.meta.env.DEV) {
        console.log(`[GlobalAlertListener] Setting up realtime subscription (Attempt ${retryCount + 1})`);
      }

      // Clean up previous channels if exist
      channels.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {
          /* ignore */
        }
      });
      channels = [];

      // Strategy:
      // - Admins: single unfiltered subscription
      // - Non-admins with few vehicles: filtered subscription per device_id
      // - Non-admins with many vehicles: single unfiltered subscription (avoid too many channels)
      const shouldFilterPerDevice = !isAdmin && userDeviceIds.length > 0 && userDeviceIds.length <= MAX_DEVICE_CHANNELS;

      if (shouldFilterPerDevice) {
        if (import.meta.env.DEV) {
          console.log(`[GlobalAlertListener] Subscribing with ${userDeviceIds.length} filtered channels`);
        }
        userDeviceIds.forEach((deviceId) => {
          const ch = supabase
            .channel(`global_proactive_alerts_${deviceId}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'proactive_vehicle_events',
                filter: `device_id=eq.${deviceId}`,
              },
              (payload) => {
                const newEvent = payload.new as ProactiveEvent;
                handleNewEventRef.current(newEvent);
              }
            )
            .subscribe((status) => {
              if (import.meta.env.DEV) {
                console.log(`[GlobalAlertListener] Channel(${deviceId}) status: ${status}`);
              }
            });
          channels.push(ch);
        });
        retryCount = 0;
        return;
      }

      // Single channel with retry logic (admin or many devices)
      const ch = supabase
        .channel('global_proactive_alerts')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'proactive_vehicle_events',
          },
          (payload) => {
            const newEvent = payload.new as ProactiveEvent;
            handleNewEventRef.current(newEvent);
          }
        )
        .subscribe((status) => {
          if (import.meta.env.DEV) {
            console.log(`[GlobalAlertListener] Subscription status: ${status}`);
          }

          if (status === 'SUBSCRIBED') {
            if (import.meta.env.DEV) {
              console.log('[GlobalAlertListener] ✅ Successfully subscribed to proactive_vehicle_events');
            }
            retryCount = 0; // Reset retry count on success
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff: 1s, 2s, 4s... max 30s
            console.warn(`[GlobalAlertListener] ⚠️ Subscription ${status}. Retrying in ${delay}ms...`);

            retryCount++;
            retryTimeout = setTimeout(() => {
              setupSubscription();
            }, delay);
          }
        });
      channels.push(ch);
    };

    // Initial subscription
    setupSubscription();

    return () => {
      if (import.meta.env.DEV) {
        console.log('[GlobalAlertListener] Cleaning up subscription');
      }
      if (retryTimeout) clearTimeout(retryTimeout);
      channels.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {
          /* ignore */
        }
      });
    };
  }, [user?.id, isAdmin, userDeviceIdsKey]);

  // This component renders nothing - it's just a listener
  return null;
}
