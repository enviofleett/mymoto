import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Vehicle {
  id: string;
  name: string;
  plate: string;
  driver: string;
  status: "active" | "maintenance" | "inactive";
  fuel: number;
  location: string;
}

const vehicles: Vehicle[] = [
  {
    id: "V001",
    name: "Truck A-101",
    plate: "ABC-1234",
    driver: "John Smith",
    status: "active",
    fuel: 85,
    location: "Route 66, Denver",
  },
  {
    id: "V002",
    name: "Van B-205",
    plate: "XYZ-5678",
    driver: "Sarah Johnson",
    status: "active",
    fuel: 62,
    location: "Highway 1, LA",
  },
  {
    id: "V003",
    name: "Truck C-310",
    plate: "DEF-9012",
    driver: "Mike Davis",
    status: "maintenance",
    fuel: 45,
    location: "Service Center #3",
  },
  {
    id: "V004",
    name: "Van D-415",
    plate: "GHI-3456",
    driver: "Emily Brown",
    status: "active",
    fuel: 91,
    location: "Interstate 95, Miami",
  },
  {
    id: "V005",
    name: "Truck E-520",
    plate: "JKL-7890",
    driver: "—",
    status: "inactive",
    fuel: 12,
    location: "Depot A",
  },
];

const statusConfig = {
  active: {
    label: "Active",
    className: "bg-status-active/10 text-status-active border-status-active/20",
  },
  maintenance: {
    label: "Maintenance",
    className: "bg-status-maintenance/10 text-status-maintenance border-status-maintenance/20",
  },
  inactive: {
    label: "Inactive",
    className: "bg-status-inactive/10 text-status-inactive border-status-inactive/20",
  },
};

export function VehicleTable() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium">Vehicle</TableHead>
            <TableHead className="text-muted-foreground font-medium">Plate</TableHead>
            <TableHead className="text-muted-foreground font-medium">Driver</TableHead>
            <TableHead className="text-muted-foreground font-medium">Status</TableHead>
            <TableHead className="text-muted-foreground font-medium">Fuel</TableHead>
            <TableHead className="text-muted-foreground font-medium">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.map((vehicle) => (
            <TableRow
              key={vehicle.id}
              className="border-border hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <TableCell>
                <div>
                  <p className="font-medium text-foreground">{vehicle.name}</p>
                  <p className="text-xs text-muted-foreground">{vehicle.id}</p>
                </div>
              </TableCell>
              <TableCell className="text-foreground font-mono">{vehicle.plate}</TableCell>
              <TableCell className="text-foreground">{vehicle.driver}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={statusConfig[vehicle.status].className}
                >
                  {statusConfig[vehicle.status].label}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        vehicle.fuel > 50
                          ? "bg-status-active"
                          : vehicle.fuel > 25
                          ? "bg-status-maintenance"
                          : "bg-status-inactive"
                      }`}
                      style={{ width: `${vehicle.fuel}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">{vehicle.fuel}%</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{vehicle.location}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
