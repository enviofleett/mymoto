import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Check,
  Clock,
  MapPin,
  Battery,
  Gauge,
  Power,
  TrendingDown,
  TrendingUp,
  Radio,
  Loader2,
  Bell,
  History,
  Navigation,
  Car
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotifications } from "@/hooks/useNotifications";
import { useNotificationPreferences, type AlertType, type SeverityLevel } from "@/hooks/useNotificationPreferences";
import { NotificationPermissionBanner } from "@/components/notifications/NotificationPermissionBanner";

interface ProactiveNotificationsProps {
  deviceId?: string;
  limit?: number;
  showHistory?: boolean;
}

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
  acknowledged_at?: string;
}

// Event type to icon mapping
const EVENT_ICONS: Record<string, React.ElementType> = {
  low_battery: Battery,
  critical_battery: Battery,
  overspeeding: Gauge,
  harsh_braking: TrendingDown,
  rapid_acceleration: TrendingUp,
  ignition_on: Power,
  ignition_off: Power,
  geofence_enter: MapPin,
  geofence_exit: MapPin,
  idle_too_long: Clock,
  offline: Radio,
  online: Radio,
  predictive_briefing: Navigation
};

// Severity to color mapping
const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800',
  error: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
  critical: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
};

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
  error: 'bg-orange-500',
  critical: 'bg-red-500'
};

export function ProactiveNotifications({
  deviceId,
  limit = 20,
  showHistory = true
}: ProactiveNotificationsProps) {
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { showNotification, playAlertSound, permission } = useNotifications();
  const { shouldPlaySound, shouldShowPush, preferences } = useNotificationPreferences();

  // Fetch historical events from database
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('proactive_vehicle_events' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit) as any;

      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }

      if (!showHistory) {
        query = query.eq('acknowledged', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      setEvents((data || []).map((e: any) => ({
        ...e,
        severity: e.severity as ProactiveEvent['severity'],
        metadata: e.metadata as Record<string, unknown>
      })));
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, limit, showHistory]);

  // Send email notification for critical/error events (triggered by new events from DB)
  const sendEmailNotification = useCallback(async (event: {
    id: string;
    device_id: string;
    event_type: string;
    severity: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) => {
    // Only send emails for critical and error severity events
    if (event.severity !== 'critical' && event.severity !== 'error') {
      return;
    }

    try {
      console.log(`Sending email notification for ${event.severity} event: ${event.title}`);
      
      const { error } = await supabase.functions.invoke('send-alert-email', {
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

      if (error) {
        console.error('Failed to send email notification:', error);
      } else {
        console.log('Email notification sent successfully');
      }
    } catch (err) {
      console.error('Error invoking send-alert-email function:', err);
    }
  }, []);

  // Acknowledge an event
  const handleAcknowledge = useCallback(async (eventId: string) => {
    try {
      const { error } = await (supabase
        .from('proactive_vehicle_events' as any)
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', eventId) as any);

      if (error) throw error;

      setEvents(prev => 
        showHistory 
          ? prev.map(e => e.id === eventId ? { ...e, acknowledged: true, acknowledged_at: new Date().toISOString() } : e)
          : prev.filter(e => e.id !== eventId)
      );
      
      toast({
        title: "Acknowledged",
        description: "Alert has been acknowledged"
      });
    } catch (err) {
      console.error('Error acknowledging event:', err);
      toast({
        title: "Error",
        description: "Failed to acknowledge alert",
        variant: "destructive"
      });
    }
  }, [showHistory, toast]);

  useEffect(() => {
    fetchEvents();

    // Subscribe ONLY to new events from database (alerts are now generated by DB triggers)
    // This makes alerts work even when the browser is closed!
    const eventsChannel = supabase
      .channel('proactive_events_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proactive_vehicle_events',
          filter: deviceId ? `device_id=eq.${deviceId}` : undefined
        },
        (payload) => {
          const newEvent = payload.new as ProactiveEvent;
          console.log('[ProactiveNotifications] New event from DB trigger:', newEvent);
          
          setEvents(prev => {
            // Avoid duplicates
            if (prev.some(e => e.id === newEvent.id)) return prev;
            
            const mappedEvent: ProactiveEvent = {
              ...newEvent,
              severity: newEvent.severity as ProactiveEvent['severity'],
              metadata: newEvent.metadata as Record<string, unknown>
            };
            
            const alertType = mappedEvent.event_type as AlertType;
            const severity = mappedEvent.severity as SeverityLevel;
            
            // Check user preferences for sound
            if (shouldPlaySound(alertType, severity)) {
              playAlertSound(severity, preferences.soundVolume);
            }
            
            // Always show in-app toast for critical/error
            if (severity === 'critical' || severity === 'error') {
              toast({
                title: mappedEvent.title,
                description: mappedEvent.message,
                variant: "destructive"
              });
              
              // Trigger email notification for critical events
              sendEmailNotification({
                id: mappedEvent.id,
                device_id: mappedEvent.device_id,
                event_type: mappedEvent.event_type,
                severity: mappedEvent.severity,
                title: mappedEvent.title,
                message: mappedEvent.message,
                metadata: mappedEvent.metadata
              });
            } else if (severity === 'warning') {
              toast({
                title: mappedEvent.title,
                description: mappedEvent.message
              });
            }
            
            // Check user preferences for push notification
            if (permission === 'granted' && shouldShowPush(alertType, severity)) {
              showNotification({
                title: severity === 'critical' ? `🚨 ${mappedEvent.title}` : mappedEvent.title,
                body: mappedEvent.message,
                tag: `alert-${mappedEvent.id}`,
                requireInteraction: severity === 'critical',
                data: {
                  eventId: mappedEvent.id,
                  deviceId: mappedEvent.device_id,
                  eventType: mappedEvent.event_type
                }
              });
            }
            
            return [mappedEvent, ...prev].slice(0, limit);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
    };
  }, [deviceId, fetchEvents, limit, toast, sendEmailNotification, showNotification, playAlertSound, permission, shouldPlaySound, shouldShowPush, preferences.soundVolume]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading notifications...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Bell className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No alerts</p>
        <p className="text-xs mt-1">All systems operating normally</p>
      </div>
    );
  }

  const unacknowledgedCount = events.filter(e => !e.acknowledged).length;

  return (
    <div className="space-y-3">
      <NotificationPermissionBanner />
      
      {showHistory && unacknowledgedCount > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            <span>{unacknowledgedCount} unacknowledged</span>
          </div>
        </div>
      )}
      
      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-4">
          {events.map((event) => {
            const Icon = EVENT_ICONS[event.event_type] || AlertCircle;
            const severityColor = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
            const badgeColor = SEVERITY_BADGE_COLORS[event.severity] || SEVERITY_BADGE_COLORS.info;
            const timeAgo = formatDistanceToNow(new Date(event.created_at), { addSuffix: true });

            return (
              <Card
                key={event.id}
                className={`p-4 border-l-4 ${severityColor} ${event.acknowledged ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${badgeColor} bg-opacity-10`}>
                    <Icon className={`h-5 w-5 ${badgeColor.replace('bg-', 'text-')}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm leading-tight">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {event.acknowledged && (
                          <Badge variant="outline" className="text-xs bg-muted">
                            <Check className="h-3 w-3 mr-1" />
                            Acknowledged
                          </Badge>
                        )}
                        <Badge variant="outline" className={`${badgeColor} text-white text-xs`}>
                          {event.severity.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    {event.message && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {event.message}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo}
                      </span>
                      <span className="font-mono">{event.device_id}</span>
                    </div>

                    {!event.acknowledged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAcknowledge(event.id)}
                        className="h-7 text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
