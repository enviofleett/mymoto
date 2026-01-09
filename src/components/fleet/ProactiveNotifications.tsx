import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Info,
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
  Bell
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProactiveNotificationsProps {
  deviceId?: string;
  limit?: number;
}

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string | null;
  metadata: any;
  created_at: string;
  acknowledged: boolean;
}

// Event type to icon mapping
const EVENT_ICONS: Record<string, any> = {
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
  online: Radio
};

// Severity to color mapping
const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200'
};

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
  error: 'bg-orange-500',
  critical: 'bg-red-500'
};

export function ProactiveNotifications({
  deviceId,
  limit = 10
}: ProactiveNotificationsProps) {
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchEvents();

    // Subscribe to position changes for real-time alerts
    const channel = supabase
      .channel('proactive_alerts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vehicle_positions',
          filter: deviceId ? `device_id=eq.${deviceId}` : undefined
        },
        (payload) => {
          // Generate proactive events from position updates
          generateProactiveEvents(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [deviceId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Fetch recent position data to generate alerts
      const query = supabase
        .from('vehicle_positions')
        .select('*')
        .order('gps_time', { ascending: false })
        .limit(limit);

      if (deviceId) {
        query.eq('device_id', deviceId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Generate events from position data
      const generatedEvents: ProactiveEvent[] = [];
      
      (data || []).forEach((pos: any) => {
        // Low battery alert
        if (pos.battery_percent && pos.battery_percent > 0 && pos.battery_percent < 20) {
          generatedEvents.push({
            id: `battery-${pos.device_id}`,
            device_id: pos.device_id,
            event_type: pos.battery_percent < 10 ? 'critical_battery' : 'low_battery',
            severity: pos.battery_percent < 10 ? 'critical' : 'warning',
            title: `Low Battery Alert`,
            description: `Battery at ${pos.battery_percent}%`,
            metadata: { battery_percent: pos.battery_percent },
            created_at: pos.gps_time || new Date().toISOString(),
            acknowledged: false
          });
        }

        // Overspeeding alert
        if (pos.is_overspeeding && pos.speed > 0) {
          generatedEvents.push({
            id: `speed-${pos.device_id}`,
            device_id: pos.device_id,
            event_type: 'overspeeding',
            severity: pos.speed > 120 ? 'error' : 'warning',
            title: `Overspeeding Detected`,
            description: `Vehicle traveling at ${pos.speed} km/h`,
            metadata: { speed: pos.speed },
            created_at: pos.gps_time || new Date().toISOString(),
            acknowledged: false
          });
        }

        // Offline alert
        if (pos.is_online === false) {
          generatedEvents.push({
            id: `offline-${pos.device_id}`,
            device_id: pos.device_id,
            event_type: 'offline',
            severity: 'warning',
            title: `Vehicle Offline`,
            description: `No GPS signal received`,
            metadata: {},
            created_at: pos.gps_time || new Date().toISOString(),
            acknowledged: false
          });
        }
      });

      setEvents(generatedEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateProactiveEvents = (position: any) => {
    const newEvents: ProactiveEvent[] = [];
    
    // Low battery
    if (position.battery_percent && position.battery_percent > 0 && position.battery_percent < 20) {
      newEvents.push({
        id: `battery-${position.device_id}-${Date.now()}`,
        device_id: position.device_id,
        event_type: position.battery_percent < 10 ? 'critical_battery' : 'low_battery',
        severity: position.battery_percent < 10 ? 'critical' : 'warning',
        title: `Low Battery Alert`,
        description: `Battery at ${position.battery_percent}%`,
        metadata: { battery_percent: position.battery_percent },
        created_at: new Date().toISOString(),
        acknowledged: false
      });
    }

    // Overspeeding
    if (position.is_overspeeding && position.speed > 0) {
      newEvents.push({
        id: `speed-${position.device_id}-${Date.now()}`,
        device_id: position.device_id,
        event_type: 'overspeeding',
        severity: position.speed > 120 ? 'error' : 'warning',
        title: `Overspeeding Detected`,
        description: `Vehicle traveling at ${position.speed} km/h`,
        metadata: { speed: position.speed },
        created_at: new Date().toISOString(),
        acknowledged: false
      });
    }

    if (newEvents.length > 0) {
      setEvents(prev => [...newEvents, ...prev].slice(0, limit));
      
      // Show toast for critical events
      newEvents.filter(e => e.severity === 'critical' || e.severity === 'error').forEach(event => {
        toast({
          title: event.title,
          description: event.description || '',
          variant: "destructive"
        });
      });
    }
  };

  const handleAcknowledge = (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
    toast({
      title: "Acknowledged",
      description: "Alert dismissed"
    });
  };

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

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.event_type] || AlertCircle;
        const severityColor = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
        const badgeColor = SEVERITY_BADGE_COLORS[event.severity] || SEVERITY_BADGE_COLORS.info;
        const timeAgo = formatDistanceToNow(new Date(event.created_at), { addSuffix: true });

        return (
          <Card
            key={event.id}
            className={`p-4 border-l-4 ${severityColor}`}
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
                  <Badge variant="outline" className={`${badgeColor} text-white text-xs shrink-0`}>
                    {event.severity.toUpperCase()}
                  </Badge>
                </div>

                {event.description && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {event.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAcknowledge(event.id)}
                  className="h-7 text-xs"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Acknowledge
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}