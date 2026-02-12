import { useState, useEffect, useCallback, useMemo } from "react";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { VehicleTable } from "@/components/fleet/VehicleTable";
import { AssignDriverDialog } from "@/components/fleet/AssignDriverDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData, FleetVehicle } from "@/hooks/useFleetData";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { useToast } from "@/hooks/use-toast";

import { 
  Truck, Users, Link2, Plus, Pencil, Trash2, Route, Bell, CalendarIcon, Eye, Loader2,
  MapPin, Gauge, BatteryLow, BatteryMedium, BatteryFull, Power, User, Navigation, WifiOff
} from "lucide-react";

import { formatLagos } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
import { VehicleAvatarMap } from "@/components/fleet/VehicleAvatarMap";
import { getStaticMapUrl } from "@/utils/mapbox-geocoding";
import { useVehicleEvents } from "@/hooks/useVehicleProfile";

interface Driver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  status: string;
  created_at: string;
}

const Fleet = () => {
  const { vehicles, loading: vehiclesLoading, connectionStatus, refetch } = useFleetData();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  // Enable real-time updates for all fleet vehicles
  const deviceIds = vehicles.map((v) => v.id).filter(Boolean) as string[];
  useRealtimeFleetUpdates(deviceIds);

  // Drivers state
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    license_number: "",
    status: "active",
  });

  // Assignment state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedVehicleForAssign, setSelectedVehicleForAssign] = useState<FleetVehicle | null>(null);

  // Vehicle selection for details/controls/reports
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<"wall" | "reports" | "data">("wall");

  const fetchDrivers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDrivers(((data || []) as Driver[]));
    } catch (err: unknown) {
      console.error("Error fetching drivers:", err);
      toast({
        title: "Error",
        description: "Failed to load drivers",
        variant: "destructive",
      });
    } finally {
      setDriversLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      license_number: "",
      status: "active",
    });
    setEditingDriver(null);
  };

  const handleOpenDriverDialog = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        name: driver.name,
        email: driver.email || "",
        phone: driver.phone || "",
        license_number: driver.license_number || "",
        status: driver.status,
      });
    } else {
      resetForm();
    }
    setDriverDialogOpen(true);
  };

  const handleSubmitDriver = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingDriver) {
        const { error } = await supabase
          .from("profiles")
          .update({
            name: formData.name,
            email: formData.email || null,
            phone: formData.phone || null,
            license_number: formData.license_number || null,
            status: formData.status,
          })
          .eq("id", editingDriver.id);

        if (error) throw error;
        toast({ title: "Success", description: "Driver updated successfully" });
      } else {
        const { error } = await supabase.from("profiles").insert({
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          license_number: formData.license_number || null,
          status: formData.status,
        });

        if (error) throw error;
        toast({ title: "Success", description: "Driver added successfully" });
      }

      setDriverDialogOpen(false);
      resetForm();
      fetchDrivers();
    } catch (err: unknown) {
      console.error("Error saving driver:", err);
      toast({
        title: "Error",
        description: "Failed to save driver",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!confirm("Are you sure you want to delete this driver?")) return;

    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Driver deleted successfully" });
      fetchDrivers();
    } catch (err: unknown) {
      console.error("Error deleting driver:", err);
      toast({
        title: "Error",
        description: "Failed to delete driver",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "on_leave":
        return <Badge variant="outline">On Leave</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleAssignClick = (vehicle: FleetVehicle) => {
    setSelectedVehicleForAssign(vehicle);
    setAssignDialogOpen(true);
  };

  const handleVehicleSelect = (vehicle: FleetVehicle) => {
    setSelectedVehicleId(vehicle.id);
  };

  const unassignedVehicles = vehicles.filter((v) => !v.driver);

  const handleRefresh = async () => {
    await Promise.all([refetch(), fetchDrivers()]);
  };

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return vehicles[0] ?? null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0] ?? null;
  }, [vehicles, selectedVehicleId]);

  const { data: vehicleEvents = [], isLoading: eventsLoading } = useVehicleEvents(
    selectedVehicle?.id ?? null,
    { limit: 15 },
    !!selectedVehicle?.id
  );

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [selectedVehicleId, vehicles]);

  const lastUpdateLabel = selectedVehicle?.lastUpdate
    ? formatLagos(selectedVehicle.lastUpdate, "MMM dd, yyyy • HH:mm")
    : "Unknown time";

  const hasValidCoords = !!selectedVehicle &&
    selectedVehicle.lat !== null &&
    selectedVehicle.lon !== null &&
    selectedVehicle.lat !== 0 &&
    selectedVehicle.lon !== 0;

  const coverMapUrl = selectedVehicle && hasValidCoords
    ? getStaticMapUrl(selectedVehicle.lon as number, selectedVehicle.lat as number, 1200, 360)
    : null;


  const batteryBadge = (battery: number | null) => {
    if (battery === null) return <Badge variant="secondary">Battery N/A</Badge>;
    if (battery < 20) return <Badge className="bg-destructive/90">{battery}%</Badge>;
    if (battery < 50) return <Badge className="bg-yellow-500/90">{battery}%</Badge>;
    return <Badge className="bg-green-600/90">{battery}%</Badge>;
  };

  const statusBadge = (status: FleetVehicle["status"]) => {
    if (status === "moving") return <Badge className="bg-green-600/90">Moving</Badge>;
    if (status === "stopped") return <Badge variant="secondary">Stopped</Badge>;
    return (
      <Badge variant="outline" className="border-muted text-muted-foreground flex items-center gap-1">
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  };

  const wallItems = useMemo(() => {
    if (!selectedVehicle) return [];

    const EVENT_ICONS: Record<string, typeof MapPin> = {
      low_battery: BatteryLow,
      critical_battery: BatteryLow,
      overspeeding: Gauge,
      harsh_braking: Gauge,
      rapid_acceleration: Gauge,
      ignition_on: Power,
      ignition_off: Power,
      geofence_enter: MapPin,
      geofence_exit: MapPin,
      idle_too_long: Navigation,
      offline: WifiOff,
      online: Navigation,
      predictive_briefing: Navigation,
    };

    const events = (vehicleEvents || []).map((event: any) => {
      const createdAt = event.created_at ? new Date(event.created_at) : new Date();
      const severity = (event.severity || "info") as "info" | "warning" | "error" | "critical";
      const tone =
        severity === "critical" || severity === "error"
          ? "danger"
          : severity === "warning"
            ? "warning"
            : "normal";

      return {
        id: event.id || `${event.event_type}-${createdAt.getTime()}`,
        title: event.title || event.event_type || "Vehicle Event",
        body: event.message || event.metadata?.message || "New activity detected.",
        icon: EVENT_ICONS[event.event_type] || Bell,
        tone,
        time: createdAt,
      };
    });

    if (events.length > 0) return events;

    const timestamp = selectedVehicle.lastUpdate ?? new Date();
    return [
      {
        id: "status",
        title: `Status: ${selectedVehicle.status}`,
        body: selectedVehicle.status === "offline"
          ? `Last seen ${selectedVehicle.offlineDuration || "recently"} ago.`
          : `Live at ${selectedVehicle.speed} km/h.`,
        icon: selectedVehicle.status === "offline" ? WifiOff : Navigation,
        tone: selectedVehicle.status === "offline" ? "muted" : "normal",
        time: timestamp,
      },
      selectedVehicle.isOverspeeding ? {
        id: "overspeed",
        title: "Overspeed Alert",
        body: "Vehicle exceeded the speed threshold. Review driver behavior.",
        icon: Gauge,
        tone: "danger",
        time: timestamp,
      } : null,
      selectedVehicle.battery !== null && selectedVehicle.battery < 20 ? {
        id: "battery",
        title: "Low Battery",
        body: `Battery at ${selectedVehicle.battery}%. Consider charging.`,
        icon: BatteryLow,
        tone: "warning",
        time: timestamp,
      } : null,
      {
        id: "driver",
        title: selectedVehicle.driver ? "Driver Assigned" : "No Driver Assigned",
        body: selectedVehicle.driver
          ? `${selectedVehicle.driver.name} is linked to this vehicle.`
          : "Assign a driver to enable accountability and reports.",
        icon: User,
        tone: selectedVehicle.driver ? "normal" : "muted",
        time: timestamp,
      },
      {
        id: "location",
        title: "Location Update",
        body: selectedVehicle.location || "No GPS fix available.",
        icon: MapPin,
        tone: "normal",
        time: timestamp,
      },
      {
        id: "ignition",
        title: "Ignition",
        body: selectedVehicle.ignition ? "Ignition is ON." : "Ignition is OFF.",
        icon: Power,
        tone: selectedVehicle.ignition ? "normal" : "muted",
        time: timestamp,
      },
    ].filter(Boolean) as Array<{
      id: string;
      title: string;
      body: string;
      icon: typeof MapPin;
      tone: "normal" | "warning" | "danger" | "muted";
      time: Date;
    }>;
  }, [selectedVehicle, vehicleEvents]);

  return (
    <DashboardLayout connectionStatus={connectionStatus}>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="space-y-6 pb-32">
          {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet Management</h1>
          <p className="text-muted-foreground">
            Manage vehicles, drivers, and assignments with live vehicle profiles
          </p>
        </div>

        {/* Fleet Log + Vehicle Profile */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Fleet Log */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Route className="h-5 w-5" />
                Fleet Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleTable
                vehicles={vehicles}
                loading={vehiclesLoading}
                onAssignmentChange={refetch}
                onVehicleSelect={handleVehicleSelect}
                selectedVehicleId={selectedVehicleId}
                showDetailsModal={false}
              />
            </CardContent>
          </Card>

          {/* Vehicle Profile */}
          <div className="space-y-4">
            {!selectedVehicle ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Select a vehicle to view its profile.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="overflow-hidden border-border">
                  <div className="relative">
                    <div className="h-36 md:h-44 bg-muted relative overflow-hidden">
                      {coverMapUrl ? (
                        <img
                          src={coverMapUrl}
                          alt="Vehicle location map"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-primary/20 via-accent/20 to-muted" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/20 to-transparent" />
                    </div>
                    <div className="px-6 pb-6">
                      <div className="-mt-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative h-20 w-20 rounded-full bg-background border border-border shadow-sm overflow-hidden">
                            {selectedVehicle.status !== "offline" && (
                              <div className="absolute inset-0 rounded-full ring-2 ring-primary/40 animate-pulse" />
                            )}
                            <VehicleAvatarMap
                              latitude={selectedVehicle.lat}
                              longitude={selectedVehicle.lon}
                            />
                            <div className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border px-2 py-0.5 text-[10px] font-semibold shadow-sm">
                              {selectedVehicle.speed} km/h
                            </div>
                          </div>
                          <div>
                            <h2 className="text-xl font-semibold">{selectedVehicle.name}</h2>
                            <p className="text-sm text-muted-foreground">{selectedVehicle.plate}</p>
                            <div className="mt-2 flex flex-wrap gap-2 items-center">
                              {statusBadge(selectedVehicle.status)}
                              {batteryBadge(selectedVehicle.battery)}
                              {selectedVehicle.ignition ? (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Power className="h-3 w-3" />
                                  Ignition ON
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Ignition OFF</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline">
                            <Bell className="h-4 w-4 mr-2" />
                            Follow
                          </Button>
                          <Button size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            View Live
                          </Button>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Speed</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Gauge className="h-4 w-4 text-muted-foreground" />
                            <span className="text-lg font-semibold">{selectedVehicle.speed} km/h</span>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Mileage</p>
                          <p className="text-lg font-semibold mt-1">
                            {selectedVehicle.mileage ? `${selectedVehicle.mileage} km` : "N/A"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Driver</p>
                          <p className="text-sm font-medium mt-1">
                            {selectedVehicle.driver?.name || "Unassigned"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <p className="text-xs text-muted-foreground">Last Update</p>
                          <p className="text-sm font-medium mt-1">{lastUpdateLabel}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="h-4 w-4" />
                      Vehicle Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <VehicleLocationMap
                      latitude={selectedVehicle.lat}
                      longitude={selectedVehicle.lon}
                      heading={0}
                      speed={selectedVehicle.speed}
                      address={selectedVehicle.location}
                      vehicleName={selectedVehicle.name}
                      isOnline={selectedVehicle.status !== "offline"}
                      mapHeight="h-72"
                      showAddressCard
                    />
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bell className="h-4 w-4" />
                      Vehicle Profile Wall
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={profileTab} onValueChange={(value) => setProfileTab(value as "wall" | "reports" | "data")}>
                      <TabsList className="bg-muted/60">
                        <TabsTrigger value="wall">Wall</TabsTrigger>
                        <TabsTrigger value="reports">Reports</TabsTrigger>
                        <TabsTrigger value="data">Data</TabsTrigger>
                      </TabsList>

                      <TabsContent value="wall" className="mt-4 space-y-4">
                        {eventsLoading ? (
                          <Card className="border-border bg-card">
                            <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading vehicle activity...
                            </CardContent>
                          </Card>
                        ) : (
                          wallItems.map((item) => (
                            <div key={item.id} className="flex gap-3 rounded-lg border border-border p-4 bg-card">
                              <div
                                className={cn(
                                  "h-9 w-9 rounded-full flex items-center justify-center",
                                  item.tone === "danger" && "bg-destructive/15 text-destructive",
                                  item.tone === "warning" && "bg-yellow-500/15 text-yellow-600",
                                  item.tone === "muted" && "bg-muted text-muted-foreground",
                                  item.tone === "normal" && "bg-primary/10 text-primary"
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{item.title}</p>
                                    <p className="text-sm text-muted-foreground">{item.body}</p>
                                  </div>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatLagos(item.time, "MMM dd • HH:mm")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>

                      <TabsContent value="reports" className="mt-4 grid gap-4 md:grid-cols-2">
                        <Card className="border-border bg-card">
                          <CardContent className="p-4 space-y-2">
                            <p className="text-xs text-muted-foreground">Operational Report</p>
                            <p className="text-lg font-semibold">Status Snapshot</p>
                            <p className="text-sm text-muted-foreground">
                              {selectedVehicle.status === "offline"
                                ? "Vehicle is currently offline."
                                : "Vehicle is reporting live data."}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {statusBadge(selectedVehicle.status)}
                              {selectedVehicle.isOverspeeding && (
                                <Badge className="bg-destructive/90">Overspeed</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="border-border bg-card">
                          <CardContent className="p-4 space-y-2">
                            <p className="text-xs text-muted-foreground">Mileage Report</p>
                            <p className="text-lg font-semibold">
                              {selectedVehicle.mileage ? `${selectedVehicle.mileage} km` : "No data"}
                            </p>
                            <p className="text-sm text-muted-foreground">Last update {lastUpdateLabel}</p>
                          </CardContent>
                        </Card>
                        <Card className="border-border bg-card">
                          <CardContent className="p-4 space-y-2">
                            <p className="text-xs text-muted-foreground">Driver Report</p>
                            <p className="text-lg font-semibold">{selectedVehicle.driver?.name || "Unassigned"}</p>
                            <p className="text-sm text-muted-foreground">
                              {selectedVehicle.driver?.phone || "No phone on file"}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-border bg-card">
                          <CardContent className="p-4 space-y-2">
                            <p className="text-xs text-muted-foreground">Battery Report</p>
                            <div className="flex items-center gap-2">
                              {selectedVehicle.battery !== null && selectedVehicle.battery < 20 ? (
                                <BatteryLow className="h-4 w-4 text-destructive" />
                              ) : selectedVehicle.battery !== null && selectedVehicle.battery < 50 ? (
                                <BatteryMedium className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <BatteryFull className="h-4 w-4 text-green-600" />
                              )}
                              <span className="text-lg font-semibold">
                                {selectedVehicle.battery !== null ? `${selectedVehicle.battery}%` : "N/A"}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {selectedVehicle.ignition ? "Ignition ON" : "Ignition OFF"}
                            </p>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="data" className="mt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Card className="border-border bg-card">
                            <CardContent className="p-4 space-y-1">
                              <p className="text-xs text-muted-foreground">GPS Owner</p>
                              <p className="font-medium">{selectedVehicle.gpsOwner || "Not set"}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-border bg-card">
                            <CardContent className="p-4 space-y-1">
                              <p className="text-xs text-muted-foreground">Location</p>
                              <p className="font-medium">{selectedVehicle.location}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-border bg-card">
                            <CardContent className="p-4 space-y-1">
                              <p className="text-xs text-muted-foreground">Speed</p>
                              <p className="font-medium">{selectedVehicle.speed} km/h</p>
                            </CardContent>
                          </Card>
                          <Card className="border-border bg-card">
                            <CardContent className="p-4 space-y-1">
                              <p className="text-xs text-muted-foreground">Offline Duration</p>
                              <p className="font-medium">{selectedVehicle.offlineDuration || "—"}</p>
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Tabs for Drivers and Assignments */}
        <Tabs defaultValue="drivers" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="drivers" className="data-[state=active]:bg-background">
              <Users className="h-4 w-4 mr-2" />
              Drivers
            </TabsTrigger>
            <TabsTrigger value="assignments" className="data-[state=active]:bg-background">
              <Link2 className="h-4 w-4 mr-2" />
              Assignments
            </TabsTrigger>
          </TabsList>

          {/* Drivers Tab */}
          <TabsContent value="drivers" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Drivers ({drivers.length})
                </CardTitle>
                {isAdmin && (
                  <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => handleOpenDriverDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Driver
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingDriver ? "Edit Driver" : "Add New Driver"}
                        </DialogTitle>
                        <DialogDescription>
                          {editingDriver 
                            ? "Update the driver's details below." 
                            : "Enter the details for the new driver."}
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmitDriver} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                              setFormData({ ...formData, email: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone</Label>
                          <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData({ ...formData, phone: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="license">License Number</Label>
                          <Input
                            id="license"
                            value={formData.license_number}
                            onChange={(e) =>
                              setFormData({ ...formData, license_number: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="status">Status</Label>
                          <Select
                            value={formData.status}
                            onValueChange={(value) =>
                              setFormData({ ...formData, status: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="on_leave">On Leave</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDriverDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit">
                            {editingDriver ? "Update" : "Add"} Driver
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {driversLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : drivers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No drivers found. Add your first driver to get started.
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {drivers.map((driver) => (
                        <Card key={driver.id} className="bg-muted/30">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold">{driver.name}</p>
                                <p className="text-sm text-muted-foreground">{driver.phone || "-"}</p>
                                <p className="text-sm text-muted-foreground">{driver.license_number || "-"}</p>
                                <div className="mt-2">{getStatusBadge(driver.status)}</div>
                              </div>
                              {isAdmin && (
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenDriverDialog(driver)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteDriver(driver.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block rounded-md border">
                      <ScrollArea className="w-full whitespace-nowrap">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>License</TableHead>
                              <TableHead>Status</TableHead>
                              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {drivers.map((driver) => (
                              <TableRow key={driver.id}>
                                <TableCell className="font-medium">{driver.name}</TableCell>
                                <TableCell>{driver.phone || "-"}</TableCell>
                                <TableCell>{driver.license_number || "-"}</TableCell>
                                <TableCell>{getStatusBadge(driver.status)}</TableCell>
                                {isAdmin && (
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleOpenDriverDialog(driver)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteDriver(driver.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Assignments Tab */}
          <TabsContent value="assignments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Unassigned Vehicles ({unassignedVehicles.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vehiclesLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : unassignedVehicles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>All vehicles are assigned to drivers!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unassignedVehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
                      >
                        <div>
                          <p className="font-medium">{vehicle.name}</p>
                          <p className="text-sm text-muted-foreground">{vehicle.plate}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAssignClick(vehicle)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Assign Driver
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <AssignDriverDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        vehicle={selectedVehicleForAssign}
        onSuccess={() => {
          setAssignDialogOpen(false);
          setSelectedVehicleForAssign(null);
          refetch();
        }}
      />
      </PullToRefresh>
    </DashboardLayout>
  );
};

export default Fleet;
