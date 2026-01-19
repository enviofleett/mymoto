import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Car, User } from "lucide-react";
import { VehicleWithAssignment } from "@/hooks/useAssignmentManagement";
import { cn } from "@/lib/utils";

interface VehicleRowProps {
  vehicle: VehicleWithAssignment;
  isSelected: boolean;
  onSelect: (deviceId: string) => void;
}

export function VehicleRow({ vehicle, isSelected, onSelect }: VehicleRowProps) {
  const isAssigned = vehicle.assignedTo !== null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-colors",
        isSelected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted"
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onSelect(vehicle.device_id)}
      />
      <Car className={cn(
        "h-4 w-4 sm:h-5 sm:w-5 shrink-0",
        isAssigned ? "text-green-500" : "text-muted-foreground"
      )} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-sm">{vehicle.device_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {vehicle.device_id}
          {vehicle.gps_owner && (
            <span className="text-primary"> • {vehicle.gps_owner}</span>
          )}
        </p>
      </div>
      {isAssigned ? (
        <Badge variant="default" className="shrink-0 text-xs bg-green-500/10 text-green-600 border-green-500/30">
          <User className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">{vehicle.assignedTo.profile_name}</span>
          <span className="sm:hidden">Assigned</span>
        </Badge>
      ) : (
        <Badge variant="secondary" className="shrink-0 text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
          Unassigned
        </Badge>
      )}
    </div>
  );
}
