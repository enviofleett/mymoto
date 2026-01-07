import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  Bell, 
  AlertTriangle, 
  Gauge, 
  Power, 
  PowerOff,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Truck,
  TrendingDown,
  Battery
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";

interface AlarmEvent {
  id: string;
  device_id: string;
  event_type: 'overspeed' | 'ignition_on' | 'ignition_off' | 'low_battery' | 'stopped';
  speed: number;
  latitude: number;
  longitude: number;
  gps_time: string;
  battery_percent: number | null;
}

interface AssignedVehicle {
  device_id: string;
  vehicle_alias: string | null;
  device_name: string;
}

interface AlarmReportProps {
  deviceIds: string[];
  vehicles: AssignedVehicle[];
}

export function AlarmReport({ deviceIds, vehicles }: AlarmReportProps) {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (deviceIds.length > 0) {
      fetchAlarms();
    } else {
      setLoading(false);
    }
  }, [deviceIds, page, selectedDevice, dateRange, eventFilter]);

  const fetchAlarms = async () => {
    try {
      setLoading(true);
      
      const fromDate = subDays(new Date(), parseInt(dateRange)).toISOString();
      const filterDevices = selectedDevice === "all" ? deviceIds : [selectedDevice];
      
      // Build query - we'll detect events from position history
      // Overspeed: speed > 120km/h
      // Ignition changes: track when ignition_on changes
      let query = supabase
        .from("position_history")
        .select("*")
        .in("device_id", filterDevices)
        .gte("gps_time", fromDate)
        .order("gps_time", { ascending: false });

      // Apply event-specific filters
      if (eventFilter === "overspeed") {
        query = query.gt("speed", 120);
      } else if (eventFilter === "stopped") {
        query = query.eq("speed", 0);
      }

      const { data, error } = await query
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      // Process data to identify alarm events
      const events: AlarmEvent[] = [];
      let prevIgnitionState: { [key: string]: boolean | null } = {};

      for (const record of data || []) {
        let eventType: AlarmEvent['event_type'] | null = null;

        // Detect overspeed (>120 km/h is a common threshold)
        if (record.speed > 120) {
          eventType = 'overspeed';
        }
        // Detect low battery (<20%)
        else if (record.battery_percent !== null && record.battery_percent > 0 && record.battery_percent < 20) {
          eventType = 'low_battery';
        }
        // Detect ignition changes
        else if (record.ignition_on !== null && prevIgnitionState[record.device_id] !== undefined) {
          if (record.ignition_on && !prevIgnitionState[record.device_id]) {
            eventType = 'ignition_on';
          } else if (!record.ignition_on && prevIgnitionState[record.device_id]) {
            eventType = 'ignition_off';
          }
        }
        // Detect stops (speed 0 with ignition off)
        else if (record.speed === 0 && record.ignition_on === false) {
          eventType = 'stopped';
        }

        prevIgnitionState[record.device_id] = record.ignition_on;

        // Add to events if we found an event or showing all
        if (eventType && (eventFilter === "all" || eventFilter === eventType)) {
          events.push({
            id: record.id,
            device_id: record.device_id,
            event_type: eventType,
            speed: record.speed,
            latitude: record.latitude,
            longitude: record.longitude,
            gps_time: record.gps_time,
            battery_percent: record.battery_percent
          });
        }
      }

      setAlarms(events.slice(0, PAGE_SIZE));
      setHasMore(events.length > PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching alarms:", err);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleName = (deviceId: string) => {
    const vehicle = vehicles.find(v => v.device_id === deviceId);
    return vehicle?.vehicle_alias || vehicle?.device_name || deviceId;
  };

  const getEventIcon = (eventType: AlarmEvent['event_type']) => {
    switch (eventType) {
      case 'overspeed':
        return <Gauge className="h-4 w-4 text-destructive" />;
      case 'ignition_on':
        return <Power className="h-4 w-4 text-green-500" />;
      case 'ignition_off':
        return <PowerOff className="h-4 w-4 text-yellow-500" />;
      case 'low_battery':
        return <Battery className="h-4 w-4 text-orange-500" />;
      case 'stopped':
        return <TrendingDown className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventBadge = (eventType: AlarmEvent['event_type']) => {
    switch (eventType) {
      case 'overspeed':
        return <Badge variant="destructive">Overspeed</Badge>;
      case 'ignition_on':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Engine Start</Badge>;
      case 'ignition_off':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Engine Stop</Badge>;
      case 'low_battery':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Low Battery</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Vehicle Stopped</Badge>;
    }
  };

  if (deviceIds.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No Alarm Data</h3>
          <p className="text-muted-foreground mt-1">
            You need assigned vehicles to view alarm reports.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Alarm & Event Reports
            </CardTitle>
            <CardDescription>
              Overspeed, ignition changes, and vehicle events
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-[160px]">
                <Truck className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.device_id} value={v.device_id}>
                    {v.vehicle_alias || v.device_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[140px]">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="overspeed">Overspeed</SelectItem>
                <SelectItem value="ignition_on">Engine Start</SelectItem>
                <SelectItem value="ignition_off">Engine Stop</SelectItem>
                <SelectItem value="low_battery">Low Battery</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[120px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">24 hours</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : alarms.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No alarm events found for this period.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your filters or date range.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alarms.map((alarm) => (
                    <TableRow key={alarm.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getEventIcon(alarm.event_type)}
                          {getEventBadge(alarm.event_type)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getVehicleName(alarm.device_id)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(new Date(alarm.gps_time), "MMM d, HH:mm")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(alarm.gps_time), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {alarm.event_type === 'overspeed' && (
                          <span className="text-destructive font-medium">{alarm.speed} km/h</span>
                        )}
                        {alarm.event_type === 'low_battery' && (
                          <span className="text-orange-500 font-medium">{alarm.battery_percent}%</span>
                        )}
                        {(alarm.event_type === 'ignition_on' || alarm.event_type === 'ignition_off') && (
                          <span className="text-muted-foreground">-</span>
                        )}
                        {alarm.event_type === 'stopped' && (
                          <span className="text-muted-foreground">Engine off</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-mono">
                            {alarm.latitude.toFixed(4)}, {alarm.longitude.toFixed(4)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {alarms.length} events (Page {page + 1})
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
