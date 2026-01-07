import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FleetVehicle } from "@/hooks/useFleetData";
import { UserPlus, BatteryLow, BatteryMedium, BatteryFull, Power, AlertTriangle, Gauge } from "lucide-react";
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

  const getStatusBadge = (vehicle: FleetVehicle) => {
    switch (vehicle.status) {
      case 'moving':
        return <Badge variant="default" className="bg-green-600">Moving</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Stopped</Badge>;
      case 'offline':
        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-muted-foreground">Offline</Badge>
            {vehicle.offlineDuration && (
              <span className="text-xs text-muted-foreground">({vehicle.offlineDuration})</span>
            )}
          </div>
        );
    }
  };

  const getBatteryIcon = (battery: number | null) => {
    if (battery === null) return <span className="text-muted-foreground text-xs">N/A</span>;
    
    if (battery < 20) {
      return (
        <div className="flex items-center gap-1 text-red-500">
          <BatteryLow className="h-4 w-4" />
          <span className="text-xs">{battery}%</span>
        </div>
      );
    } else if (battery < 50) {
      return (
        <div className="flex items-center gap-1 text-yellow-500">
          <BatteryMedium className="h-4 w-4" />
          <span className="text-xs">{battery}%</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1 text-green-500">
          <BatteryFull className="h-4 w-4" />
          <span className="text-xs">{battery}%</span>
        </div>
      );
    }
  };

  const getIgnitionIndicator = (ignition: boolean | null) => {
    if (ignition === null) return <span className="text-muted-foreground text-xs">N/A</span>;
    
    return ignition ? (
      <div className="flex items-center gap-1 text-green-500">
        <Power className="h-4 w-4" />
        <span className="text-xs">ON</span>
      </div>
    ) : (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Power className="h-4 w-4" />
        <span className="text-xs">OFF</span>
      </div>
    );
  };

  const formatMileage = (mileage: number | null) => {
    if (mileage === null) return <span className="text-muted-foreground text-xs">N/A</span>;
    const km = (mileage / 1000).toFixed(1);
    return <span className="text-xs">{km} km</span>;
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Speed</TableHead>
              <TableHead>Mileage</TableHead>
              <TableHead>Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.plate}</p>
                  </div>
                </TableCell>
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
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {getStatusBadge(v)}
                    <div className="flex items-center gap-2">
                      {getIgnitionIndicator(v.ignition)}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {getBatteryIcon(v.battery)}
                    {v.isOverspeeding && (
                      <div className="flex items-center gap-1 text-orange-500">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-xs">Overspeed</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span>{v.speed} km/h</span>
                  </div>
                </TableCell>
                <TableCell>{formatMileage(v.mileage)}</TableCell>
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
