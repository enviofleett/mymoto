import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FleetVehicle } from "@/hooks/useFleetData";
import { UserPlus, BatteryLow, BatteryMedium, BatteryFull, Power, AlertTriangle, Gauge, Search, Filter, Eye } from "lucide-react";
import { AssignDriverDialog } from "./AssignDriverDialog";
import { VehicleDetailsModal } from "./VehicleDetailsModal";

interface VehicleTableProps {
  vehicles: FleetVehicle[];
  loading: boolean;
  onAssignmentChange?: () => void;
}

type StatusFilter = "all" | "online" | "offline";

export function VehicleTable({ vehicles, loading, onAssignmentChange }: VehicleTableProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const handleAssignClick = (vehicle: FleetVehicle, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVehicle(vehicle);
    setAssignDialogOpen(true);
  };

  const handleRowClick = (vehicle: FleetVehicle) => {
    setSelectedVehicle(vehicle);
    setDetailsModalOpen(true);
  };

  const handleAssignmentComplete = () => {
    setAssignDialogOpen(false);
    setDetailsModalOpen(false);
    setSelectedVehicle(null);
    onAssignmentChange?.();
  };

  // Filter and search logic
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        vehicle.name.toLowerCase().includes(searchLower) ||
        vehicle.plate.toLowerCase().includes(searchLower) ||
        (vehicle.driver?.name.toLowerCase().includes(searchLower) ?? false);

      // Status filter
      let matchesStatus = true;
      if (statusFilter === "online") {
        matchesStatus = vehicle.status !== "offline";
      } else if (statusFilter === "offline") {
        matchesStatus = vehicle.status === "offline";
      }

      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Loading Live Fleet Data...
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

  const onlineCount = vehicles.filter(v => v.status !== 'offline').length;
  const offlineCount = vehicles.filter(v => v.status === 'offline').length;

  return (
    <>
      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vehicles, plates, or drivers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border z-50">
              <SelectItem value="all">All ({vehicles.length})</SelectItem>
              <SelectItem value="online">Online ({onlineCount})</SelectItem>
              <SelectItem value="offline">Offline ({offlineCount})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      {(searchQuery || statusFilter !== "all") && (
        <p className="text-sm text-muted-foreground mb-2">
          Showing {filteredVehicles.length} of {vehicles.length} vehicles
        </p>
      )}

      {filteredVehicles.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {vehicles.length === 0 ? "No vehicles found." : "No vehicles match your search."}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Mileage</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVehicles.map((v) => (
                <TableRow 
                  key={v.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(v)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.plate}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {v.gpsOwner ? (
                      <Badge variant="outline" className="text-xs font-normal">
                        {v.gpsOwner}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
                        onClick={(e) => handleAssignClick(v, e)}
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
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(v);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AssignDriverDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        vehicle={selectedVehicle}
        onSuccess={handleAssignmentComplete}
      />

      <VehicleDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        vehicle={selectedVehicle}
        onAssignmentChange={handleAssignmentComplete}
      />
    </>
  );
}