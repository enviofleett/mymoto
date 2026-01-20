import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FleetMap } from "@/components/fleet/FleetMap";
import { VehicleTable } from "@/components/fleet/VehicleTable";
import { AssignDriverDialog } from "@/components/fleet/AssignDriverDialog";
import { EngineControlCard } from "@/pages/owner/OwnerVehicleProfile/components/EngineControlCard";
import { ReportsSection } from "@/pages/owner/OwnerVehicleProfile/components/ReportsSection";
import { VehicleDetailsModal } from "@/components/fleet/VehicleDetailsModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData, FleetVehicle } from "@/hooks/useFleetData";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { useVehicleTrips, useVehicleEvents, useVehicleCommand, type TripDateRange } from "@/hooks/useVehicleProfile";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Truck, Users, Link2, Plus, Pencil, Trash2, Map, Crosshair, Layers, 
  Route, Bell, CalendarIcon, Eye, Loader2
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);

  // Map state (for future enhancements)
  const [mapLayer, setMapLayer] = useState<"street" | "satellite">("street");
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Vehicle selection for details/controls/reports
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);

  const selectedVehicleForDetails = vehicles.find(v => v.id === selectedVehicleId) || null;

  // Fetch trips and events for selected vehicle
  const { data: vehicleTrips, isLoading: tripsLoading } = useVehicleTrips(
    selectedVehicleId,
    { dateRange, limit: 100 },
    !!selectedVehicleId
  );

  const { data: vehicleEvents, isLoading: eventsLoading } = useVehicleEvents(
    selectedVehicleId,
    { dateRange, limit: 50 },
    !!selectedVehicleId
  );

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, name, email, phone, license_number, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDrivers((data as Driver[]) || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
      toast({
        title: "Error",
        description: "Failed to load drivers",
        variant: "destructive",
      });
    } finally {
      setDriversLoading(false);
    }
  };

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
        const { error } = await (supabase as any)
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
        const { error } = await (supabase as any).from("profiles").insert({
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
    } catch (err) {
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
      const { error } = await (supabase as any).from("profiles").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Driver deleted successfully" });
      fetchDrivers();
    } catch (err) {
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
    setSelectedVehicle(vehicle);
    setAssignDialogOpen(true);
  };

  const handleVehicleSelect = (vehicle: FleetVehicle) => {
    setSelectedVehicleId(vehicle.id);
  };

  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  const toggleLayer = () => {
    setMapLayer((prev) => (prev === "street" ? "satellite" : "street"));
  };

  const unassignedVehicles = vehicles.filter((v) => !v.driver);
  const vehiclesWithLocation = vehicles.filter(
    (v) => v.lat !== null && v.lon !== null && v.lat !== 0 && v.lon !== 0
  );

  return (
    <DashboardLayout connectionStatus={connectionStatus}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet Management</h1>
          <p className="text-muted-foreground">
            Manage vehicles, drivers, and assignments with live map view
          </p>
        </div>

        {/* Main Layout: Map + Vehicle Details Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Map (Smaller, not full page) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Map Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Map className="h-5 w-5" />
                  Live Map
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRecenter}
                    className="h-8"
                  >
                    <Crosshair className="h-3 w-3 mr-1" />
                    Recenter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={toggleLayer}
                    className="h-8"
                  >
                    <Layers className="h-3 w-3 mr-1" />
                    {mapLayer === "street" ? "Satellite" : "Street"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[400px] md:h-[500px] relative">
                  <FleetMap vehicles={vehicles} loading={vehiclesLoading} />
                  {/* Stats Overlay */}
                  <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur">
                      {vehiclesWithLocation.length} on map
                    </Badge>
                    <Badge variant="default" className="bg-green-600/90">
                      {vehicles.filter((v) => v.status === "moving").length} moving
                    </Badge>
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur">
                      {vehicles.filter((v) => v.status === "stopped").length} stopped
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vehicles Tab */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Vehicles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VehicleTable
                  vehicles={vehicles}
                  loading={vehiclesLoading}
                  onAssignmentChange={refetch}
                  onVehicleSelect={handleVehicleSelect}
                  selectedVehicleId={selectedVehicleId}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Selected Vehicle Details, Controls, Reports */}
          <div className="space-y-4">
            {selectedVehicleForDetails ? (
              <>
                {/* Vehicle Info Card */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{selectedVehicleForDetails.name}</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDetailsModalOpen(true);
                          setSelectedVehicle(selectedVehicleForDetails);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={selectedVehicleForDetails.status === "offline" ? "outline" : "default"}>
                        {selectedVehicleForDetails.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Speed</span>
                      <span className="font-medium">{selectedVehicleForDetails.speed} km/h</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Battery</span>
                      <span className="font-medium">
                        {selectedVehicleForDetails.battery !== null ? `${selectedVehicleForDetails.battery}%` : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Driver</span>
                      <span className="font-medium">
                        {selectedVehicleForDetails.driver?.name || "Unassigned"}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Vehicle Controls */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Controls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EngineControlCard
                      deviceId={selectedVehicleForDetails.id}
                      ignitionOn={selectedVehicleForDetails.ignition}
                      isOnline={selectedVehicleForDetails.status !== "offline"}
                    />
                  </CardContent>
                </Card>

                {/* Reports */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-lg">Reports</span>
                      <Popover open={isDateFilterOpen} onOpenChange={setIsDateFilterOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <CalendarIcon className="h-3 w-3 mr-1" />
                            {dateRange?.from ? format(dateRange.from, "MMM d") : "Filter"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <CalendarComponent
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={(range) => {
                              setDateRange(range);
                              if (range?.from && range?.to) {
                                setIsDateFilterOpen(false);
                              }
                            }}
                            numberOfMonths={1}
                          />
                        </PopoverContent>
                      </Popover>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <ReportsSection
                        deviceId={selectedVehicleForDetails.id}
                        trips={vehicleTrips}
                        events={vehicleEvents}
                        tripsLoading={tripsLoading}
                        eventsLoading={eventsLoading}
                        dateRange={dateRange}
                        onDateRangeChange={setDateRange}
                        onPlayTrip={(trip) => {
                          // Handle trip playback - could open map view or modal
                          toast({
                            title: "Trip Playback",
                            description: `Playing trip from ${trip.start_time}`,
                          });
                        }}
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Truck className="h-12 w-12 mx-auto mb-3 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground">Select a vehicle to view details, controls, and reports</p>
                </CardContent>
              </Card>
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
                    <div className="hidden md:block">
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
        vehicle={selectedVehicle}
        onSuccess={() => {
          setAssignDialogOpen(false);
          setSelectedVehicle(null);
          refetch();
        }}
      />

      <VehicleDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        vehicle={selectedVehicle}
        onAssignmentChange={() => {
          refetch();
        }}
      />
    </DashboardLayout>
  );
};

export default Fleet;
