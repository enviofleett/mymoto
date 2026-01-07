import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FleetVehicle } from "@/hooks/useFleetData";

interface VehicleTableProps {
  vehicles: FleetVehicle[];
  loading: boolean;
}

export function VehicleTable({ vehicles, loading }: VehicleTableProps) {
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

  return (
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
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={v.status === 'active' ? 'default' : 'secondary'}>
                  {v.status === 'active' ? 'Moving' : 'Stopped'}
                </Badge>
              </TableCell>
              <TableCell>{v.speed}</TableCell>
              <TableCell className="max-w-[200px] truncate">{v.location}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
