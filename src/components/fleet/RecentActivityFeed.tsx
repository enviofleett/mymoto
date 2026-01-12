import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Power, AlertTriangle, Battery } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  device_id: string;
  vehicle_name: string;
  speed: number;
  ignition_on: boolean;
  battery_percent: number;
  gps_time: string;
  type: 'movement' | 'ignition' | 'stop' | 'overspeeding' | 'low_battery';
  severity?: 'info' | 'warning' | 'error';
}

interface RecentActivityFeedProps {
  deviceId?: string;  // Optional: filter by specific device
  limit?: number;     // Number of activities to show
  showCard?: boolean; // Whether to wrap in Card component
}

export function RecentActivityFeed({ deviceId, limit = 20, showCard = true }: RecentActivityFeedProps = {}) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      let query = (supabase
        .from('position_history' as any)
        .select(`
          id,
          device_id,
          speed,
          ignition_on,
          battery_percent,
          gps_time,
          latitude,
          longitude
        `)
        .order('gps_time', { ascending: false })
        .limit(limit * 2)) as any;  // Fetch more to derive events

      // Filter by device if provided
      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching activity:", error);
        setLoading(false);
        return;
      }

      const historyData = (data || []) as any[];

      // Fetch vehicle names separately
      const deviceIds = [...new Set(historyData.map((item: any) => item.device_id).filter(Boolean))];
      const { data: vehiclesData } = await (supabase
        .from('vehicles' as any)
        .select('device_id, device_name')
        .in('device_id', deviceIds) as any);

      const vehicleMap = new Map((vehiclesData || []).map((v: any) => [v.device_id, v.device_name]));

      // Derive activity events from position history
      const events: ActivityItem[] = [];

      for (let i = 0; i < historyData.length - 1; i++) {
        const current = historyData[i] as any;
        const previous = historyData[i + 1] as any;

        // Ignition state changes
        if (current.ignition_on && !previous.ignition_on) {
          events.push({
            id: `${current.id}-ignition-on`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: true,
            battery_percent: current.battery_percent || 0,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'ignition',
            severity: 'info'
          });
        } else if (!current.ignition_on && previous.ignition_on) {
          events.push({
            id: `${current.id}-ignition-off`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: 0,
            ignition_on: false,
            battery_percent: current.battery_percent || 0,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'stop',
            severity: 'info'
          });
        }

        // Overspeeding detection
        if (current.speed > 100 && previous.speed <= 100) {
          events.push({
            id: `${current.id}-overspeeding`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: current.ignition_on || false,
            battery_percent: current.battery_percent || 0,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'overspeeding',
            severity: 'error'
          });
        }

        // Low battery warnings
        if (current.battery_percent !== null && current.battery_percent < 20 &&
            (previous.battery_percent === null || previous.battery_percent >= 20)) {
          events.push({
            id: `${current.id}-low-battery`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: current.ignition_on || false,
            battery_percent: current.battery_percent || 0,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'low_battery',
            severity: 'warning'
          });
        }

        // Movement events (only if moving and no other event)
        if (current.speed > 0 && !events.some(e => e.id.startsWith(current.id))) {
          events.push({
            id: `${current.id}-movement`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: current.ignition_on || false,
            battery_percent: current.battery_percent || 0,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'movement',
            severity: 'info'
          });
        }
      }

      // Sort by timestamp and limit
      setActivities(events.sort((a, b) =>
        new Date(b.gps_time).getTime() - new Date(a.gps_time).getTime()
      ).slice(0, limit));
      setLoading(false);
    };

    fetchHistory();

    // Subscribe to new positions for live feed
    const channel = supabase
      .channel(deviceId ? `activity-feed-${deviceId}` : 'activity-feed-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'position_history',
        ...(deviceId ? { filter: `device_id=eq.${deviceId}` } : {})
      }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, limit]);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'movement':
        return <Navigation className="h-4 w-4 text-status-active" />;
      case 'ignition':
        return <Power className="h-4 w-4 text-green-500" />;
      case 'stop':
        return <MapPin className="h-4 w-4 text-muted-foreground" />;
      case 'overspeeding':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'low_battery':
        return <Battery className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getActivityMessage = (item: ActivityItem) => {
    switch (item.type) {
      case 'movement':
        return `Moving at ${item.speed} km/h`;
      case 'ignition':
        return `Engine started - Battery ${item.battery_percent}%`;
      case 'stop':
        return `Vehicle stopped`;
      case 'overspeeding':
        return `Overspeeding detected at ${item.speed} km/h`;
      case 'low_battery':
        return `Low battery warning - ${item.battery_percent}%`;
    }
  };

  const getSeverityBadge = (severity?: string) => {
    if (!severity) return null;
    const variants = {
      info: 'default',
      warning: 'outline',
      error: 'destructive'
    } as const;
    return <Badge variant={variants[severity as keyof typeof variants] || 'default'} className="text-xs">{severity}</Badge>;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
              <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <ScrollArea className="h-[320px] pr-4">
        <div className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No recent activity recorded.
            </p>
          ) : (
            activities.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0 animate-in slide-in-from-left-2 fade-in duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                  {getActivityIcon(item.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {deviceId ? getActivityMessage(item) : item.vehicle_name}
                    </p>
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(item.severity)}
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.gps_time), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deviceId ? `At ${new Date(item.gps_time).toLocaleTimeString()}` : getActivityMessage(item)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    );
  };

  if (!showCard) {
    return renderContent();
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            {deviceId ? 'Recent Activity' : 'Live Fleet Activity'}
          </CardTitle>
          {!deviceId && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-status-active opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-active"></span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
