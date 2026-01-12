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
  Battery
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";

interface ProactiveEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (deviceIds.length > 0) {
      fetchEvents();
    } else {
      setLoading(false);
    }
  }, [deviceIds, page, selectedDevice, dateRange, eventFilter]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      
      const fromDate = subDays(new Date(), parseInt(dateRange)).toISOString();
      const filterDevices = selectedDevice === "all" ? deviceIds : [selectedDevice];
      
      // Query proactive_vehicle_events directly - no client-side calculations!
      let query = (supabase
        .from("proactive_vehicle_events" as any)
        .select("*")
        .in("device_id", filterDevices)
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })) as any;

      // Apply event type filter
      if (eventFilter !== "all") {
        query = query.eq("event_type", eventFilter);
      }

      const { data, error } = await query
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      // Cast the data to our interface
      const typedEvents: ProactiveEvent[] = (data || []).map((e: any) => ({
        id: e.id,
        device_id: e.device_id,
        event_type: e.event_type,
        severity: e.severity,
        title: e.title,
        message: e.message,
        metadata: e.metadata as Record<string, unknown> | null,
        created_at: e.created_at,
      }));

      setEvents(typedEvents);
      setHasMore(typedEvents.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleName = (deviceId: string) => {
    const vehicle = vehicles.find(v => v.device_id === deviceId);
    return vehicle?.vehicle_alias || vehicle?.device_name || deviceId;
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'overspeeding':
        return <Gauge className="h-4 w-4 text-destructive" />;
      case 'ignition_on':
        return <Power className="h-4 w-4 text-green-500" />;
      case 'ignition_off':
        return <PowerOff className="h-4 w-4 text-yellow-500" />;
      case 'low_battery':
        return <Battery className="h-4 w-4 text-orange-500" />;
      case 'critical_battery':
        return <Battery className="h-4 w-4 text-destructive" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventBadge = (eventType: string, severity: string) => {
    const severityClass = severity === 'critical' 
      ? 'bg-destructive/20 text-destructive border-destructive/30'
      : severity === 'warning'
      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      : 'bg-muted text-muted-foreground';

    const labels: Record<string, string> = {
      'overspeeding': 'Overspeed',
      'ignition_on': 'Engine Start',
      'ignition_off': 'Engine Stop',
      'low_battery': 'Low Battery',
      'critical_battery': 'Critical Battery',
    };

    return <Badge className={severityClass}>{labels[eventType] || eventType}</Badge>;
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
              Real-time alerts from backend detection
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
                <SelectItem value="overspeeding">Overspeed</SelectItem>
                <SelectItem value="ignition_on">Engine Start</SelectItem>
                <SelectItem value="ignition_off">Engine Stop</SelectItem>
                <SelectItem value="low_battery">Low Battery</SelectItem>
                <SelectItem value="critical_battery">Critical Battery</SelectItem>
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
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No events found for this period.</p>
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
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getEventIcon(event.event_type)}
                          {getEventBadge(event.event_type, event.severity)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getVehicleName(event.device_id)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(new Date(event.created_at), "MMM d, HH:mm")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.event_type === 'overspeeding' && event.metadata?.speed != null && (
                          <span className="text-destructive font-medium">{event.metadata.speed as number} km/h</span>
                        )}
                        {(event.event_type === 'low_battery' || event.event_type === 'critical_battery') && event.metadata?.battery != null && (
                          <span className="text-orange-500 font-medium">{event.metadata.battery as number}%</span>
                        )}
                        {(event.event_type === 'ignition_on' || event.event_type === 'ignition_off') && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {event.metadata?.lat != null && event.metadata?.lon != null ? (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-mono">
                              {(event.metadata.lat as number).toFixed(4)}, {(event.metadata.lon as number).toFixed(4)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {events.length} events (Page {page + 1})
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
