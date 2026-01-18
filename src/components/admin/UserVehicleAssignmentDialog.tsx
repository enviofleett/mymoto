import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Car, User, Plus, X, Mail } from "lucide-react";
import { ProfileWithAssignments, VehicleWithAssignment, useAssignVehicles, useVehiclesWithAssignments } from "@/hooks/useAssignmentManagement";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserVehicleAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileWithAssignments | null;
}

export function UserVehicleAssignmentDialog({
  open,
  onOpenChange,
  profile,
}: UserVehicleAssignmentDialogProps) {
  const [selectedVehiclesToAdd, setSelectedVehiclesToAdd] = useState<Set<string>>(new Set());
  const [selectedVehiclesToRemove, setSelectedVehiclesToRemove] = useState<Set<string>>(new Set());
  const [sendEmail, setSendEmail] = useState(true);
  const [vehicleSearch, setVehicleSearch] = useState("");

  const { data: allVehicles } = useVehiclesWithAssignments("", "all");
  const assignMutation = useAssignVehicles();

  // Get user's currently assigned vehicles
  const assignedVehicles = allVehicles?.filter(
    v => v.assignedTo?.profile_id === profile?.id
  ) || [];

  // Get unassigned vehicles plus vehicles not assigned to this user
  const availableVehicles = allVehicles?.filter(
    v => !v.assignedTo || v.assignedTo.profile_id !== profile?.id
  ) || [];

  // Filter vehicles by search
  const filteredAssigned = assignedVehicles.filter(v =>
    v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  const filteredAvailable = availableVehicles.filter(v =>
    v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  // Reset selections when dialog opens/closes or profile changes
  useEffect(() => {
    if (!open) {
      setSelectedVehiclesToAdd(new Set());
      setSelectedVehiclesToRemove(new Set());
      setVehicleSearch("");
      setSendEmail(true);
    }
  }, [open, profile?.id]);

  const handleToggleAdd = (deviceId: string) => {
    setSelectedVehiclesToAdd(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleToggleRemove = (deviceId: string) => {
    setSelectedVehiclesToRemove(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      const addVehicles = Array.from(selectedVehiclesToAdd);
      const removeVehicles = Array.from(selectedVehiclesToRemove);

      if (addVehicles.length === 0 && removeVehicles.length === 0) {
        toast.info("No changes to save");
        return;
      }

      // Remove vehicles first - need to delete by both device_id and profile_id (composite key)
      if (removeVehicles.length > 0) {
        try {
          // Delete assignments for this specific user-vehicle combination
          const { error: deleteError } = await (supabase as any)
            .from("vehicle_assignments")
            .delete()
            .in("device_id", removeVehicles)
            .eq("profile_id", profile.id);

          if (deleteError) {
            throw deleteError;
          }
        } catch (error: any) {
          toast.error(`Failed to remove vehicles: ${error.message}`);
          throw error;
        }
      }

      // Add new vehicles
      if (addVehicles.length > 0) {
        // Check if user is new (had no vehicles before removing any)
        const originalAssignedCount = assignedVehicles.length + removeVehicles.length;
        const isNewUser = originalAssignedCount === 0;

        await assignMutation.mutateAsync({
          deviceIds: addVehicles,
          profileId: profile.id,
          sendEmail: sendEmail && profile.email ? {
            to: profile.email,
            userName: profile.name,
            vehicleCount: addVehicles.length,
            isNewUser,
          } : undefined,
        });
      }

      toast.success(
        `Successfully updated assignments: ${addVehicles.length > 0 ? `+${addVehicles.length} added` : ""} ${removeVehicles.length > 0 ? `-${removeVehicles.length} removed` : ""}`
      );

      onOpenChange(false);
    } catch (error: any) {
      toast.error(`Failed to update assignments: ${error.message}`);
    }
  };

  if (!profile) return null;

  const hasChanges = selectedVehiclesToAdd.size > 0 || selectedVehiclesToRemove.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Manage Vehicles for {profile.name}
          </DialogTitle>
          <DialogDescription>
            Add or remove vehicles assigned to this user. You can optionally send an email notification.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* User Info */}
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium">{profile.name}</p>
              {profile.email && (
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              )}
              {profile.phone && (
                <p className="text-sm text-muted-foreground">{profile.phone}</p>
              )}
            </div>
            <Badge variant="secondary">
              {assignedVehicles.length} vehicle{assignedVehicles.length !== 1 ? "s" : ""} assigned
            </Badge>
          </div>

          {/* Search */}
          <div className="relative">
            <Input
              placeholder="Search vehicles..."
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              className="pl-8"
            />
            <Car className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>

          {/* Email Notification Option */}
          {profile.email && selectedVehiclesToAdd.size > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked === true)}
              />
              <Label htmlFor="send-email" className="flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                <span className="text-sm">
                  Send email notification to {profile.email} about the new {selectedVehiclesToAdd.size} vehicle(s)
                </span>
              </Label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
            {/* Assigned Vehicles */}
            <div className="flex flex-col border rounded-lg overflow-hidden">
              <div className="p-3 bg-muted/30 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Assigned Vehicles ({filteredAssigned.length})
                </h3>
              </div>
              <ScrollArea className="flex-1 p-2">
                {filteredAssigned.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No vehicles assigned
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssigned.map(vehicle => (
                      <div
                        key={vehicle.device_id}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                          selectedVehiclesToRemove.has(vehicle.device_id)
                            ? "bg-destructive/10 border-destructive"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedVehiclesToRemove.has(vehicle.device_id)}
                          onCheckedChange={() => handleToggleRemove(vehicle.device_id)}
                        />
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                        </div>
                        {selectedVehiclesToRemove.has(vehicle.device_id) && (
                          <X className="h-4 w-4 text-destructive shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Available Vehicles */}
            <div className="flex flex-col border rounded-lg overflow-hidden">
              <div className="p-3 bg-muted/30 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Available Vehicles ({filteredAvailable.length})
                </h3>
              </div>
              <ScrollArea className="flex-1 p-2">
                {filteredAvailable.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No vehicles available
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAvailable.map(vehicle => (
                      <div
                        key={vehicle.device_id}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                          selectedVehiclesToAdd.has(vehicle.device_id)
                            ? "bg-primary/10 border-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedVehiclesToAdd.has(vehicle.device_id)}
                          onCheckedChange={() => handleToggleAdd(vehicle.device_id)}
                        />
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                          {vehicle.assignedTo && (
                            <p className="text-xs text-amber-500">
                              Currently: {vehicle.assignedTo.profile_name}
                            </p>
                          )}
                        </div>
                        {selectedVehiclesToAdd.has(vehicle.device_id) && (
                          <Plus className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || assignMutation.isPending}
          >
            {assignMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Changes
            {hasChanges && (
              <Badge variant="secondary" className="ml-2">
                {selectedVehiclesToAdd.size > 0 && `+${selectedVehiclesToAdd.size}`}
                {selectedVehiclesToRemove.size > 0 && `-${selectedVehiclesToRemove.size}`}
              </Badge>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
