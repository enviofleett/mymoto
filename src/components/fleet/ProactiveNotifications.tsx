import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  Check,
  Clock,
  MapPin,
  Battery,
  Gauge,
  Zap,
  Power,
  TrendingDown,
  TrendingUp,
  Radio,
  AlertOctagon,
  Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProactiveNotificationsProps {
  deviceId?: string;
  limit?: number;
  showAcknowledged?: boolean;
}

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string | null;
  metadata: any;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  created_at: string;
  acknowledged: boolean;
  age_minutes: number;
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
  online: Radio,
  maintenance_due: AlertOctagon,
  trip_completed: Check,
  anomaly_detected: Zap
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
  limit = 10,
  showAcknowledged = false
}: ProactiveNotificationsProps) {
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchEvents();

    // Subscribe to new events
    const channel = supabase
      .channel('proactive_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proactive_vehicle_events',
          filter: deviceId ? `device_id=eq.${deviceId}` : undefined
        },
        (payload) => {
          console.log('New proactive event:', payload);
          fetchEvents(); // Refresh the list
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [deviceId, showAcknowledged]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_unacknowledged_events', {
        p_device_id: deviceId || null,
        p_limit: limit
      });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching proactive events:', err);
      toast({
        title: "Error",
        description: "Failed to load notifications",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (eventId: string) => {
    setAcknowledging(eventId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('acknowledge_event', {
        p_event_id: eventId,
        p_user_id: user.id
      });

      if (error) throw error;

      toast({
        title: "Acknowledged",
        description: "Event marked as acknowledged"
      });

      // Remove from list or refresh
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (err) {
      console.error('Error acknowledging event:', err);
      toast({
        title: "Error",
        description: "Failed to acknowledge event",
        variant: "destructive"
      });
    } finally {
      setAcknowledging(null);
    }
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
        <Info className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No notifications</p>
        <p className="text-xs mt-1">All clear - no recent events to report</p>
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

                  {event.location_name && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{event.location_name}</span>
                    </span>
                  )}
                </div>

                {/* Metadata display (optional) */}
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {event.metadata.battery_percent !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        Battery: {event.metadata.battery_percent}%
                      </Badge>
                    )}
                    {event.metadata.speed !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        Speed: {event.metadata.speed} km/h
                      </Badge>
                    )}
                    {event.metadata.duration_minutes !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        Duration: {event.metadata.duration_minutes} min
                      </Badge>
                    )}
                    {event.metadata.distance_km !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        Distance: {event.metadata.distance_km.toFixed(1)} km
                      </Badge>
                    )}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAcknowledge(event.id)}
                  disabled={acknowledging === event.id}
                  className="h-7 text-xs"
                >
                  {acknowledging === event.id ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Acknowledging...
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Acknowledge
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
