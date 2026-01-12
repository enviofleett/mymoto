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
import { VehicleTable } from "@/components/fleet/VehicleTable";
import { AssignDriverDialog } from "@/components/fleet/AssignDriverDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData, FleetVehicle } from "@/hooks/useFleetData";
import { useToast } from "@/hooks/use-toast";
import { Truck, Users, Link2, Plus, Pencil, Trash2 } from "lucide-react";

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

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDrivers((data || []) as Driver[]);
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

  const unassignedVehicles = vehicles.filter((v) => !v.driver);

  return (
    <DashboardLayout connectionStatus={connectionStatus}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet Management</h1>
          <p className="text-muted-foreground">
            Manage vehicles, drivers, and assignments
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="vehicles" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="vehicles" className="data-[state=active]:bg-background">
              <Truck className="h-4 w-4 mr-2" />
              Vehicles
            </TabsTrigger>
            <TabsTrigger value="drivers" className="data-[state=active]:bg-background">
              <Users className="h-4 w-4 mr-2" />
              Drivers
            </TabsTrigger>
            <TabsTrigger value="assignments" className="data-[state=active]:bg-background">
              <Link2 className="h-4 w-4 mr-2" />
              Assignments
            </TabsTrigger>
          </TabsList>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles" className="mt-4">
            <VehicleTable
              vehicles={vehicles}
              loading={vehiclesLoading}
              onAssignmentChange={refetch}
            />
          </TabsContent>

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
    </DashboardLayout>
  );
};

export default Fleet;
