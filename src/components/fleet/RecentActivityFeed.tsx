import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Power } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  device_id: string;
  vehicle_name: string;
  speed: number;
  ignition_on: boolean;
  battery_percent: number;
  gps_time: string;
  type: 'movement' | 'ignition' | 'stop';
}

export function RecentActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('position_history')
        .select(`
          id,
          device_id,
          speed,
          ignition_on,
          battery_percent,
          gps_time
        `)
        .order('gps_time', { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching activity:", error);
        setLoading(false);
        return;
      }

      // Fetch vehicle names separately
      const deviceIds = [...new Set(data.map(item => item.device_id).filter(Boolean))];
      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('device_id, device_name')
        .in('device_id', deviceIds);

      const vehicleMap = new Map(vehiclesData?.map(v => [v.device_id, v.device_name]) || []);

      const formattedData: ActivityItem[] = data.map((item) => ({
        id: item.id,
        device_id: item.device_id || '',
        vehicle_name: vehicleMap.get(item.device_id || '') || item.device_id || 'Unknown',
        speed: item.speed || 0,
        ignition_on: item.ignition_on || false,
        battery_percent: item.battery_percent || 0,
        gps_time: item.gps_time || new Date().toISOString(),
        type: (item.speed || 0) > 0 ? 'movement' : (item.ignition_on ? 'ignition' : 'stop')
      }));

      setActivities(formattedData);
      setLoading(false);
    };

    fetchHistory();

    // Subscribe to new positions for live feed
    const channel = supabase
      .channel('activity-feed-updates')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'position_history' 
      }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel);
    };
  }, []);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'movement':
        return <Navigation className="h-4 w-4 text-status-active" />;
      case 'ignition':
        return <Power className="h-4 w-4 text-status-maintenance" />;
      case 'stop':
        return <MapPin className="h-4 w-4 text-muted-foreground" />;
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
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">
            Fleet Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading live events...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            Live Fleet Activity
          </CardTitle>
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-status-active opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-status-active"></span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent activity recorded.
              </p>
            ) : (
              activities.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                    {getActivityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.vehicle_name}
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.gps_time), { addSuffix: true })}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getActivityMessage(item)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
