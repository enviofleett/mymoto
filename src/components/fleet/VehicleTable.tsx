import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FleetVehicle } from "@/hooks/useFleetData";
import { UserPlus } from "lucide-react";
import { AssignDriverDialog } from "./AssignDriverDialog";

interface VehicleTableProps {
  vehicles: FleetVehicle[];
  loading: boolean;
  onAssignmentChange?: () => void;
}

export function VehicleTable({ vehicles, loading, onAssignmentChange }: VehicleTableProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);

  const handleAssignClick = (vehicle: FleetVehicle) => {
    setSelectedVehicle(vehicle);
    setAssignDialogOpen(true);
  };

  const handleAssignmentComplete = () => {
    setAssignDialogOpen(false);
    setSelectedVehicle(null);
    onAssignmentChange?.();
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Loading Live Fleet Data...
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        No vehicles found.
      </div>
    );
  }

  const getStatusBadge = (status: FleetVehicle['status']) => {
    switch (status) {
      case 'moving':
        return <Badge variant="default" className="bg-green-600">Moving</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Stopped</Badge>;
      case 'offline':
        return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle Name</TableHead>
              <TableHead>Assigned Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Speed (km/h)</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell>
                  {v.driver ? (
                    <div>
                      <p className="font-medium">{v.driver.name}</p>
                      {v.driver.phone && (
                        <p className="text-xs text-muted-foreground">{v.driver.phone}</p>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleAssignClick(v)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Assign
                    </Button>
                  )}
                </TableCell>
                <TableCell>{getStatusBadge(v.status)}</TableCell>
                <TableCell>{v.speed}</TableCell>
                <TableCell className="max-w-[200px] truncate">{v.location}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AssignDriverDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        vehicle={selectedVehicle}
        onSuccess={handleAssignmentComplete}
      />
    </>
  );
}
