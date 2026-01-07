import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FleetVehicle } from "@/hooks/useFleetData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  MapPin, Gauge, Battery, Power, User, Phone, 
  Calendar, AlertTriangle, Navigation, Car, UserPlus, UserMinus
} from "lucide-react";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
}

interface VehicleDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: FleetVehicle | null;
  onAssignmentChange: () => void;
}

export function VehicleDetailsModal({ 
  open, 
  onOpenChange, 
  vehicle, 
  onAssignmentChange 
}: VehicleDetailsModalProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && !vehicle?.driver) {
      fetchAvailableDrivers();
    }
    setShowAssignForm(false);
    setSelectedDriverId("");
  }, [open, vehicle]);

  const fetchAvailableDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, phone")
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
    }
  };

  const handleAssign = async () => {
    if (!vehicle || !selectedDriverId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicle_assignments")
        .upsert({
          device_id: vehicle.id,
          profile_id: selectedDriverId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });

      if (error) throw error;

      toast({ title: "Success", description: "Driver assigned successfully" });
      setShowAssignForm(false);
      setSelectedDriverId("");
      onAssignmentChange();
    } catch (err) {
      console.error("Error assigning driver:", err);
      toast({
        title: "Error",
        description: "Failed to assign driver",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!vehicle) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicle_assignments")
        .update({ profile_id: null })
        .eq("device_id", vehicle.id);

      if (error) throw error;

      toast({ title: "Success", description: "Driver unassigned successfully" });
      onAssignmentChange();
    } catch (err) {
      console.error("Error unassigning driver:", err);
      toast({
        title: "Error",
        description: "Failed to unassign driver",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  const getStatusColor = () => {
    switch (vehicle.status) {
      case 'moving': return 'bg-green-500';
      case 'stopped': return 'bg-yellow-500';
      case 'offline': return 'bg-muted-foreground';
    }
  };

  const getBatteryColor = () => {
    if (vehicle.battery === null) return 'text-muted-foreground';
    if (vehicle.battery < 20) return 'text-red-500';
    if (vehicle.battery < 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {vehicle.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Overview */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
              <div>
                <p className="font-medium capitalize">{vehicle.status}</p>
                {vehicle.offlineDuration && (
                  <p className="text-xs text-muted-foreground">for {vehicle.offlineDuration}</p>
                )}
              </div>
            </div>
            {vehicle.isOverspeeding && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Overspeeding
              </Badge>
            )}
          </div>

          <Separator />

          {/* Telemetry Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Gauge className="h-4 w-4" />
                Speed
              </div>
              <p className="text-lg font-semibold">{vehicle.speed} km/h</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Navigation className="h-4 w-4" />
                Mileage
              </div>
              <p className="text-lg font-semibold">
                {vehicle.mileage !== null ? `${(vehicle.mileage / 1000).toFixed(1)} km` : 'N/A'}
              </p>
            </div>

            <div className="space-y-1">
              <div className={`flex items-center gap-2 text-sm ${getBatteryColor()}`}>
                <Battery className="h-4 w-4" />
                Battery
              </div>
              <p className={`text-lg font-semibold ${getBatteryColor()}`}>
                {vehicle.battery !== null ? `${vehicle.battery}%` : 'N/A'}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Power className="h-4 w-4" />
                Ignition
              </div>
              <p className={`text-lg font-semibold ${vehicle.ignition ? 'text-green-500' : 'text-muted-foreground'}`}>
                {vehicle.ignition === null ? 'N/A' : vehicle.ignition ? 'ON' : 'OFF'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Location */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <MapPin className="h-4 w-4" />
              Location
            </div>
            <p className="font-medium">{vehicle.location}</p>
            {vehicle.lastUpdate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Last update: {vehicle.lastUpdate.toLocaleString()}
              </p>
            )}
          </div>

          <Separator />

          {/* Driver Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <User className="h-4 w-4" />
                Assigned Driver
              </div>
            </div>

            {vehicle.driver ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                <div>
                  <p className="font-medium">{vehicle.driver.name}</p>
                  {vehicle.driver.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {vehicle.driver.phone}
                    </p>
                  )}
                  {vehicle.driver.license_number && (
                    <p className="text-xs text-muted-foreground">
                      License: {vehicle.driver.license_number}
                    </p>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleUnassign}
                  disabled={loading}
                >
                  <UserMinus className="h-4 w-4 mr-1" />
                  Unassign
                </Button>
              </div>
            ) : showAssignForm ? (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-card">
                <div className="space-y-2">
                  <Label>Select Driver</Label>
                  <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a driver..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50">
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name} {driver.phone ? `(${driver.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAssignForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAssign} disabled={!selectedDriverId || loading}>
                    {loading ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  fetchAvailableDrivers();
                  setShowAssignForm(true);
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign Driver
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}