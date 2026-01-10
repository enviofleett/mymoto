import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationPreferences, type AlertType, type SeverityLevel } from "@/hooks/useNotificationPreferences";

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
  const { toast } = useToast();
  const { showNotification, playAlertSound, permission } = useNotifications();
  const { shouldPlaySound, shouldShowPush, preferences } = useNotificationPreferences();

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

  // Handle new event from realtime subscription
  const handleNewEvent = useCallback((event: ProactiveEvent) => {
    console.log('[GlobalAlertListener] New alert:', event.event_type, event.severity);

    const alertType = event.event_type as AlertType;
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
    }

    // Show push notification based on preferences
    if (permission === 'granted' && shouldShowPush(alertType, severity)) {
      showNotification({
        title: severity === 'critical' ? `🚨 ${event.title}` : event.title,
        body: event.message,
        tag: `alert-${event.id}`,
        requireInteraction: severity === 'critical',
        data: {
          eventId: event.id,
          deviceId: event.device_id,
          eventType: event.event_type
        }
      });
    }
  }, [toast, playAlertSound, showNotification, permission, shouldPlaySound, shouldShowPush, preferences.soundVolume, sendEmailNotification]);

  useEffect(() => {
    console.log('[GlobalAlertListener] Setting up realtime subscription');

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
          handleNewEvent(newEvent);
        }
      )
      .subscribe((status) => {
        console.log('[GlobalAlertListener] Subscription status:', status);
      });

    return () => {
      console.log('[GlobalAlertListener] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [handleNewEvent]);

  // This component renders nothing - it's just a listener
  return null;
}
