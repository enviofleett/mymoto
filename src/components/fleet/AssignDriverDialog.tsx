import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/integrations/supabase/edge";
import { useToast } from "@/hooks/use-toast";
import { FleetVehicle } from "@/hooks/useFleetData";

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  user_id: string | null;
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
        .select("id, name, phone, user_id")
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
      const driver = drivers.find((d) => d.id === selectedDriverId) || null;
      if (driver && !driver.user_id) {
        throw new Error("This profile is unlinked. Link the user account before assigning vehicles.");
      }

      const data = await invokeEdgeFunction<{ success: boolean; message?: string }>(
        "admin-vehicle-assignments",
        {
          action: "assign",
          profile_id: selectedDriverId,
          device_ids: [vehicle.id],
        }
      );
      if (!data?.success) throw new Error(data?.message || "Assignment failed");

      toast({ title: "Success", description: "Driver assigned successfully" });
      setSelectedDriverId("");
      onSuccess();
    } catch (err) {
      console.error("Error assigning driver:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to assign driver",
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
          <DialogDescription>
            Select a driver from the list below to assign them to this vehicle.
          </DialogDescription>
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
                    {driver.name} {driver.phone ? `(${driver.phone})` : ""} {!driver.user_id ? "(Unlinked)" : ""}
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
