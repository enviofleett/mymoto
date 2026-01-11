import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Car, User } from "lucide-react";
import { ProfileWithAssignments, VehicleWithAssignment, useAssignVehicles } from "@/hooks/useAssignmentManagement";

interface BulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedVehicles: VehicleWithAssignment[];
  profiles: ProfileWithAssignments[];
  onSuccess: () => void;
}

export function BulkAssignDialog({
  open,
  onOpenChange,
  selectedVehicles,
  profiles,
  onSuccess,
}: BulkAssignDialogProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [vehicleAliases, setVehicleAliases] = useState<Record<string, string>>({});
  const assignMutation = useAssignVehicles();

  const handleAssign = async () => {
    if (!selectedProfileId) return;

    await assignMutation.mutateAsync({
      deviceIds: selectedVehicles.map(v => v.device_id),
      profileId: selectedProfileId,
      vehicleAliases,
    });

    onSuccess();
    onOpenChange(false);
    setSelectedProfileId("");
    setVehicleAliases({});
  };

  const handleAliasChange = (deviceId: string, alias: string) => {
    setVehicleAliases(prev => ({
      ...prev,
      [deviceId]: alias,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            Assign {selectedVehicles.length} Vehicle{selectedVehicles.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Select a user to assign the selected vehicles to. You can optionally set custom aliases for each vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Selection */}
          <div className="space-y-2">
            <Label htmlFor="profile">Assign to User</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{profile.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({profile.assignmentCount} vehicles)
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle List with Aliases */}
          <div className="space-y-2">
            <Label>Vehicles to Assign</Label>
            <ScrollArea className="h-[300px] rounded-md border p-2">
              <div className="space-y-2">
                {selectedVehicles.map(vehicle => (
                  <div
                    key={vehicle.device_id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                  >
                    <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {vehicle.device_id}
                        {vehicle.assignedTo && (
                          <span className="text-amber-500 ml-2">
                            (Currently: {vehicle.assignedTo.profile_name})
                          </span>
                        )}
                      </p>
                    </div>
                    <Input
                      placeholder="Alias (optional)"
                      className="w-32 h-8 text-xs"
                      value={vehicleAliases[vehicle.device_id] || ""}
                      onChange={(e) => handleAliasChange(vehicle.device_id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedProfileId || assignMutation.isPending}
          >
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign {selectedVehicles.length} Vehicle{selectedVehicles.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
