import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Battery,
  Gauge,
  Radio,
  MapPin,
  Power,
  Clock,
  Check,
  CheckCheck,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Bell,
  TrendingDown,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Navigate } from "react-router-dom";

// Event type configurations
const EVENT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "low_battery", label: "Low Battery" },
  { value: "critical_battery", label: "Critical Battery" },
  { value: "overspeeding", label: "Overspeeding" },
  { value: "offline", label: "Offline" },
  { value: "online", label: "Online" },
  { value: "ignition_on", label: "Ignition On" },
  { value: "ignition_off", label: "Ignition Off" },
  { value: "geofence_enter", label: "Geofence Enter" },
  { value: "geofence_exit", label: "Geofence Exit" },
  { value: "harsh_braking", label: "Harsh Braking" },
  { value: "rapid_acceleration", label: "Rapid Acceleration" },
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

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
  online: Radio
};

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-500" },
  error: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-500" },
  warning: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-500" },
  info: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500" },
};

interface VehicleEvent {
  id: string;
  device_id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export default function AdminAlerts() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [acknowledgedFilter, setAcknowledgedFilter] = useState<"all" | "acknowledged" | "unacknowledged">("all");
  
  // Selection state
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

  // Fetch events
  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-alerts", severityFilter, eventTypeFilter, acknowledgedFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("proactive_vehicle_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }
      if (eventTypeFilter !== "all") {
        query = query.eq("event_type", eventTypeFilter);
      }
      if (acknowledgedFilter === "acknowledged") {
        query = query.eq("acknowledged", true);
      } else if (acknowledgedFilter === "unacknowledged") {
        query = query.eq("acknowledged", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data as any[]) || []) as VehicleEvent[];
    },
    enabled: isAdmin,
  });

  // Filtered events based on search
  const filteredEvents = events.filter((event) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      event.device_id.toLowerCase().includes(search) ||
      event.title.toLowerCase().includes(search) ||
      event.message.toLowerCase().includes(search)
    );
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (eventIds: string[]) => {
      const { error } = await (supabase as any)
        .from("proactive_vehicle_events")
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .in("id", eventIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-alerts"] });
      setSelectedEvents(new Set());
      toast({
        title: "Events Acknowledged",
        description: "Selected events have been acknowledged",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to acknowledge events",
        variant: "destructive",
      });
    },
  });

  // Selection handlers
  const handleSelectAll = useCallback(() => {
    if (selectedEvents.size === filteredEvents.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(filteredEvents.map((e) => e.id)));
    }
  }, [filteredEvents, selectedEvents.size]);

  const handleSelectEvent = useCallback((eventId: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  const handleBulkAcknowledge = useCallback(() => {
    if (selectedEvents.size === 0) return;
    acknowledgeMutation.mutate(Array.from(selectedEvents));
  }, [selectedEvents, acknowledgeMutation]);

  const handleAcknowledgeSingle = useCallback((eventId: string) => {
    acknowledgeMutation.mutate([eventId]);
  }, [acknowledgeMutation]);

  // Stats
  const stats = {
    total: events.length,
    unacknowledged: events.filter((e) => !e.acknowledged).length,
    critical: events.filter((e) => e.severity === "critical" && !e.acknowledged).length,
    today: events.filter((e) => {
      const eventDate = new Date(e.created_at);
      const today = new Date();
      return eventDate.toDateString() === today.toDateString();
    }).length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Alerts History
            </h1>
            <p className="text-muted-foreground">
              View and manage all vehicle alerts and events
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Alerts</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unacknowledged</CardDescription>
              <CardTitle className="text-3xl text-yellow-600">{stats.unacknowledged}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Critical Pending</CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.critical}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Today's Alerts</CardDescription>
              <CardTitle className="text-3xl">{stats.today}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by device ID, title, or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={acknowledgedFilter} onValueChange={(v) => setAcknowledgedFilter(v as typeof acknowledgedFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedEvents.size > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedEvents.size} event(s) selected
                </span>
                <Button
                  size="sm"
                  onClick={handleBulkAcknowledge}
                  disabled={acknowledgeMutation.isPending}
                >
                  {acknowledgeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCheck className="h-4 w-4 mr-2" />
                  )}
                  Acknowledge Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Events Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No alerts found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedEvents.size === filteredEvents.length && filteredEvents.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => {
                      const Icon = EVENT_ICONS[event.event_type] || AlertCircle;
                      const severityStyle = SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.info;

                      return (
                        <TableRow
                          key={event.id}
                          className={event.acknowledged ? "opacity-60" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedEvents.has(event.id)}
                              onCheckedChange={() => handleSelectEvent(event.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`${severityStyle.bg} ${severityStyle.text} border-0`}
                            >
                              {event.severity.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{event.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {event.device_id}
                            </code>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {event.message}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                              </span>
                              <span className="text-xs text-muted-foreground/60">
                                {format(new Date(event.created_at), "MMM d, HH:mm")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {event.acknowledged ? (
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!event.acknowledged && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAcknowledgeSingle(event.id)}
                                disabled={acknowledgeMutation.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
