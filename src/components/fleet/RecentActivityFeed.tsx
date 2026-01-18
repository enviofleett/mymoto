import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Power, AlertTriangle, Battery, ExternalLink, Clock, Gauge } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { useAddress } from "@/hooks/useAddress";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityItem {
  id: string;
  device_id: string;
  vehicle_name: string;
  speed: number;
  ignition_on: boolean;
  battery_percent: number | null;
  gps_time: string;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  type: 'movement' | 'ignition' | 'stop' | 'overspeeding' | 'low_battery';
  severity?: 'info' | 'warning' | 'error';
}

interface RecentActivityFeedProps {
  deviceId?: string;  // Optional: filter by specific device
  limit?: number;     // Number of activities to show
  showCard?: boolean; // Whether to wrap in Card component
}

// Helper functions (defined before component for use inside)
function getDetailedInfo(item: ActivityItem) {
  const details: string[] = [];
  
  if (item.speed > 0) {
    details.push(`${item.speed} km/h`);
  }
  
  if (item.battery_percent !== null && item.battery_percent > 0) {
    details.push(`Battery ${item.battery_percent}%`);
  }
  
  if (item.heading !== null && item.heading !== undefined) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const direction = directions[Math.round(item.heading / 45) % 8];
    details.push(`Heading ${direction}`);
  }
  
  return details.length > 0 ? details.join(' • ') : null;
}

function getActivityMessage(item: ActivityItem) {
  switch (item.type) {
    case 'movement':
      return `Moving at ${item.speed} km/h`;
    case 'ignition':
      return `Engine started${item.battery_percent !== null ? ` - Battery ${item.battery_percent}%` : ''}`;
    case 'stop':
      return `Vehicle stopped`;
    case 'overspeeding':
      return `Overspeeding detected at ${item.speed} km/h`;
    case 'low_battery':
      return `Low battery warning - ${item.battery_percent}%`;
  }
}

function getActivityIcon(type: ActivityItem['type']) {
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
}

function getSeverityBadge(severity?: string) {
  if (!severity) return null;
  const variants = {
    info: 'default',
    warning: 'outline',
    error: 'destructive'
  } as const;
  return <Badge variant={variants[severity as keyof typeof variants] || 'default'} className="text-xs">{severity}</Badge>;
}

export function RecentActivityFeed({ deviceId, limit = 20, showCard = true }: RecentActivityFeedProps = {}) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      // Only fetch recent data (last 6 hours) to avoid timeout on large tables
      // This uses the index on (device_id, gps_time DESC) for fast queries
      // 6 hours is enough for "Live" activity and prevents timeouts
      const recentCutoff = new Date();
      recentCutoff.setHours(recentCutoff.getHours() - 6);
      
      // Build query - optimized for index usage
      // Use gps_time filter first, then filter nulls client-side for better performance
      let query = (supabase as any)
        .from('position_history')
        .select(`
          id,
          device_id,
          speed,
          ignition_on,
          battery_percent,
          gps_time,
          latitude,
          longitude,
          heading
        `)
        .gte('gps_time', recentCutoff.toISOString()) // Time filter FIRST - uses index
        .order('gps_time', { ascending: false })
        .limit(limit * 5);  // Fetch more to account for null coordinate filtering

      // Filter by device if provided
      if (deviceId) {
        query = query.eq('device_id', deviceId);
      }

      let data: any[] | null = null;
      let queryError = null;

      try {
        const result = await query;
        data = result.data;
        queryError = result.error;
      } catch (err: any) {
        queryError = err;
        console.error("[RecentActivityFeed] Query exception:", err);
      }

      // If timeout error, try with even shorter time window (last 2 hours)
      if (queryError && (queryError.code === '57014' || queryError.message?.includes('timeout'))) {
        console.log('[RecentActivityFeed] Timeout detected, trying shorter time window (2 hours)');
        const shortCutoff = new Date();
        shortCutoff.setHours(shortCutoff.getHours() - 2);
        
        const shortQuery = (supabase as any)
          .from('position_history')
          .select(`
            id,
            device_id,
            speed,
            ignition_on,
            battery_percent,
            gps_time,
            latitude,
            longitude,
            heading
          `)
          .gte('gps_time', shortCutoff.toISOString())
          .order('gps_time', { ascending: false })
          .limit(limit * 3);  // Fetch more to account for null coordinate filtering
        
        if (deviceId) {
          shortQuery.eq('device_id', deviceId);
        }
        
        const shortResult = await shortQuery;
        if (!shortResult.error) {
          data = shortResult.data;
          queryError = null;
          console.log('[RecentActivityFeed] Short window (2h) query succeeded');
        } else {
          console.error("[RecentActivityFeed] Short window query also failed:", shortResult.error);
        }
      }

      if (queryError && queryError.code !== '57014' && !queryError.message?.includes('timeout')) {
        console.error("[RecentActivityFeed] Non-timeout error, skipping:", queryError);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        console.log('[RecentActivityFeed] No position_history data, will try vehicle_positions fallback');
      }

      console.log(`[RecentActivityFeed] Fetched ${data?.length || 0} position records`);

      // Filter invalid coordinates client-side (simpler and more reliable)
      let positionData = (data as any[] || []).filter((item: any) => {
        const lat = item.latitude;
        const lon = item.longitude;
        // Valid coordinates: not null, within range, not (0,0)
        return lat !== null && lon !== null &&
               !isNaN(lat) && !isNaN(lon) &&
               lat >= -90 && lat <= 90 &&
               lon >= -180 && lon <= 180 &&
               !(lat === 0 && lon === 0);
      });

      console.log(`[RecentActivityFeed] Filtered to ${positionData.length} valid position records`);

      // Fallback: If no position_history data, use vehicle_positions
      if (!positionData || positionData.length === 0) {
        console.log('[RecentActivityFeed] No position_history data, falling back to vehicle_positions');
        const { data: currentPositions, error: posError } = await (supabase as any)
          .from('vehicle_positions')
          .select(`
            device_id,
            speed,
            ignition_on,
            battery_percent,
            gps_time,
            latitude,
            longitude,
            heading
          `)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('cached_at', { ascending: false })
          .limit(limit);

        // Filter invalid coordinates client-side
        const validPositions = (currentPositions || []).filter((pos: any) => {
          const lat = pos.latitude;
          const lon = pos.longitude;
          return lat !== null && lon !== null &&
                 !isNaN(lat) && !isNaN(lon) &&
                 lat >= -90 && lat <= 90 &&
                 lon >= -180 && lon <= 180 &&
                 !(lat === 0 && lon === 0);
        });

        if (posError) {
          console.error('[RecentActivityFeed] Error fetching vehicle_positions:', posError);
        } else if (validPositions && validPositions.length > 0) {
          // Convert vehicle_positions to position_history format
          positionData = validPositions.map((pos: any) => ({
            id: `vp-${pos.device_id}-${Date.now()}`,
            device_id: pos.device_id,
            speed: pos.speed || 0,
            ignition_on: pos.ignition_on || false,
            battery_percent: pos.battery_percent,
            gps_time: pos.gps_time || pos.cached_at || new Date().toISOString(),
            latitude: pos.latitude,
            longitude: pos.longitude,
            heading: pos.heading
          }));
          console.log(`[RecentActivityFeed] Using ${positionData.length} records from vehicle_positions`);
        }
      }

      // Fetch vehicle names separately
      const deviceIds = [...new Set(positionData.map((item: any) => item.device_id).filter(Boolean))];
      const { data: vehiclesData } = await (supabase as any)
        .from('vehicles')
        .select('device_id, device_name')
        .in('device_id', deviceIds);

      const vehicleMap = new Map((vehiclesData as any[])?.map((v: any) => [v.device_id, v.device_name]) || []);

      // Derive activity events from position history
      const events: ActivityItem[] = [];

      // If we have very few records, show them directly as activity
      if (positionData.length < 3) {
        positionData.forEach((current) => {
          const activityType = current.speed > 0 ? 'movement' : 
                              current.ignition_on ? 'ignition' : 'stop';
          events.push({
            id: `${current.id}-${activityType}`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: current.ignition_on || false,
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
            gps_time: current.gps_time || new Date().toISOString(),
            type: activityType,
            severity: 'info'
          });
        });
      } else {
        // Compare consecutive records for state changes
        for (let i = 0; i < positionData.length - 1; i++) {
          const current = positionData[i];
          const previous = positionData[i + 1];

        // Ignition state changes
        if (current.ignition_on && !previous.ignition_on) {
          events.push({
            id: `${current.id}-ignition-on`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: true,
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
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
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
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
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
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
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
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
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
            gps_time: current.gps_time || new Date().toISOString(),
            type: 'movement',
            severity: 'info'
          });
        }
      }
      }

      // If no events detected but we have data, show recent positions as activity
      if (events.length === 0 && positionData.length > 0) {
        console.log('[RecentActivityFeed] No events detected, showing recent positions');
        // Show most recent positions as activity
        positionData.slice(0, limit).forEach((current) => {
          const activityType = current.speed > 0 ? 'movement' : 
                              current.ignition_on ? 'ignition' : 'stop';
          events.push({
            id: `${current.id}-recent-${activityType}`,
            device_id: current.device_id || '',
            vehicle_name: vehicleMap.get(current.device_id || '') || current.device_id || 'Unknown',
            speed: current.speed || 0,
            ignition_on: current.ignition_on || false,
            battery_percent: current.battery_percent,
            latitude: current.latitude,
            longitude: current.longitude,
            heading: current.heading,
            gps_time: current.gps_time || new Date().toISOString(),
            type: activityType,
            severity: 'info'
          });
        });
      }

      // Sort by timestamp and limit
      const sortedEvents = events.sort((a, b) =>
        new Date(b.gps_time).getTime() - new Date(a.gps_time).getTime()
      ).slice(0, limit);
      
      console.log(`[RecentActivityFeed] Generated ${sortedEvents.length} activity events`);
      setActivities(sortedEvents);
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
              <ActivityItemDetail key={item.id} item={item} index={index} deviceId={deviceId} />
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

// Detailed Activity Item Component
function ActivityItemDetail({ item, index, deviceId }: { item: ActivityItem; index: number; deviceId?: string }) {
  const { address, isLoading: addressLoading } = useAddress(
    item.latitude ?? null,
    item.longitude ?? null
  );
  
  const hasValidLocation = item.latitude !== null && item.longitude !== null &&
    item.latitude !== 0 && item.longitude !== 0 &&
    item.latitude >= -90 && item.latitude <= 90 &&
    item.longitude >= -180 && item.longitude <= 180;
  
  const mapsUrl = hasValidLocation 
    ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
    : null;
  
  const detailedInfo = getDetailedInfo(item);
  const activityMessage = getActivityMessage(item);
  const formattedTime = format(new Date(item.gps_time), 'HH:mm:ss');
  const formattedDate = format(new Date(item.gps_time), 'MMM dd, yyyy');

  return (
    <div
      className="border-b border-border pb-3 last:border-0 last:pb-0 animate-in slide-in-from-left-2 fade-in duration-300"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
          {getActivityIcon(item.type)}
        </div>
        <div className="flex-1 min-w-0">
          {/* Header: Vehicle Name / Activity Message */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-foreground truncate">
              {deviceId ? activityMessage : item.vehicle_name}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {getSeverityBadge(item.severity)}
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(item.gps_time), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Activity Message / Details */}
          {!deviceId && (
            <p className="text-xs text-muted-foreground mb-1.5">
              {activityMessage}
            </p>
          )}

          {/* Detailed Info: Speed, Battery, Heading */}
          {detailedInfo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Gauge className="h-3 w-3" />
              <span>{detailedInfo}</span>
            </div>
          )}

          {/* Location */}
          {hasValidLocation && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground mb-1.5">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {addressLoading ? (
                  <Skeleton className="h-3 w-32" />
                ) : (
                  <span className="line-clamp-1">
                    {address || `${item.latitude?.toFixed(5)}, ${item.longitude?.toFixed(5)}`}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Timestamp and Actions */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formattedTime} • {formattedDate}</span>
            </div>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                <span>View Map</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

