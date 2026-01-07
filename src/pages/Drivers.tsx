import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

interface Driver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  status: string;
  created_at: string;
}

const Drivers = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    license_number: "",
    status: "active",
  });

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
      toast({
        title: "Error",
        description: "Failed to load drivers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

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

  const handleOpenDialog = (driver?: Driver) => {
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
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

      setDialogOpen(false);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this driver?")) return;

    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Drivers</h1>
            <p className="text-muted-foreground">
              Manage your fleet drivers and their assignments.
            </p>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
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
                <form onSubmit={handleSubmit} className="space-y-4">
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
                      onClick={() => setDialogOpen(false)}
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Drivers ({drivers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading drivers...
              </div>
            ) : drivers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No drivers found. Add your first driver to get started.
              </div>
            ) : (
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
                              onClick={() => handleOpenDialog(driver)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(driver.id)}
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
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Drivers;
