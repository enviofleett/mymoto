import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FleetVehicle } from "@/hooks/useFleetData";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
}

interface AssignDriverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: FleetVehicle | null;
  onSuccess: () => void;
}

export function AssignDriverDialog({ open, onOpenChange, vehicle, onSuccess }: AssignDriverDialogProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchAvailableDrivers();
    }
  }, [open]);

  const fetchAvailableDrivers = async () => {
    try {
      const { data, error } = await (supabase as any)
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
      const { error } = await (supabase as any)
        .from("vehicle_assignments")
        .upsert({
          device_id: vehicle.id,
          profile_id: selectedDriverId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id,profile_id' });

      if (error) throw error;

      toast({ title: "Success", description: "Driver assigned successfully" });
      setSelectedDriverId("");
      onSuccess();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Driver to {vehicle?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Driver</Label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a driver..." />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name} {driver.phone ? `(${driver.phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedDriverId || loading}>
              {loading ? "Assigning..." : "Assign Driver"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
