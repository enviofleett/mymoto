import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationPreferences, type AlertType, type SeverityLevel } from "@/hooks/useNotificationPreferences";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";

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
  
  // Get list of device IDs for user's assigned vehicles
  const userDeviceIds = ownerVehicles?.map(v => v.deviceId) || [];

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
      console.log('[GlobalAlertListener] Ignoring alert for unassigned vehicle:', event.device_id);
      return;
    }

    console.log('[GlobalAlertListener] New alert for user vehicle:', event.event_type, event.severity, event.device_id);

    // Normalize event type to match notification preferences
    const alertType = normalizeEventType(event.event_type) as AlertType;
    const severity = event.severity as SeverityLevel;

    // Play sound based on preferences
    if (shouldPlaySound(alertType, severity)) {
      playAlertSound(severity, preferences.soundVolume);
    }

    // Show toast for critical/error/warning
    if (severity === 'critical' || severity === 'error') {
      toast({
        title: event.title,
        description: event.message,
        variant: "destructive"
      });
      
      // Trigger email for critical/error
      sendEmailNotification(event);
    } else if (severity === 'warning') {
      toast({
        title: event.title,
        description: event.message
      });
    } else if (severity === 'info') {
      // Show info notifications if user has enabled push for this alert type
      // This ensures ignition_on/ignition_off show up when enabled
      if (shouldShowPush(alertType, severity)) {
        toast({
          title: event.title,
          description: event.message,
          variant: "default"
        });
      }
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

  useEffect(() => {
    if (!user) {
      if (import.meta.env.DEV) {
        console.log('[GlobalAlertListener] No user, skipping realtime subscription');
      }
      return;
    }

    authRedirectedRef.current = false;
    if (import.meta.env.DEV) {
      console.log('[GlobalAlertListener] Setting up realtime subscription');
    }

    const channel = supabase
      .channel('global_proactive_alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proactive_vehicle_events'
        },
        (payload) => {
          const newEvent = payload.new as ProactiveEvent;
          handleNewEventRef.current(newEvent);
        }
      )
      .subscribe(async (status) => {
        if (import.meta.env.DEV) {
          console.log('[GlobalAlertListener] Subscription status:', status);
        }
        if (status === 'SUBSCRIBED') {
          if (import.meta.env.DEV) {
            console.log('[GlobalAlertListener] ✅ Successfully subscribed to proactive_vehicle_events');
          }
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[GlobalAlertListener] ❌ Subscription error:', status);
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) {
            if (!authRedirectedRef.current) {
              authRedirectedRef.current = true;
              console.error('[GlobalAlertListener] Auth invalid on channel error, redirecting to /auth');
              navigate('/auth', { replace: true });
            }
            return;
          }
        }
      });

    return () => {
      if (import.meta.env.DEV) {
        console.log('[GlobalAlertListener] Cleaning up subscription');
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [user, navigate]);

  // This component renders nothing - it's just a listener
  return null;
}
