import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FleetVehicle } from "@/hooks/useFleetData";
import { usePrefetchVehicleDetails } from "@/hooks/useVehicleDetails";
import { UserPlus, BatteryLow, BatteryMedium, BatteryFull, Power, AlertTriangle, Gauge, Search, Filter, Eye, Truck, Plus, WifiOff } from "lucide-react";
import { AssignDriverDialog } from "./AssignDriverDialog";
import { VehicleDetailsModal } from "./VehicleDetailsModal";
import { LocationCell } from "./LocationCell";

interface VehicleTableProps {
  vehicles: FleetVehicle[];
  loading: boolean;
  onAssignmentChange?: () => void;
  onVehicleSelect?: (vehicle: FleetVehicle) => void;
  selectedVehicleId?: string | null;
  showDetailsModal?: boolean;
}

type StatusFilter =
  | "online"
  | "offline"
  | "moving"
  | "stopped"
  | "overspeeding"
  | "ignition_on"
  | "ignition_off"
  | "low_battery";

export function VehicleTable({
  vehicles,
  loading,
  onAssignmentChange,
  onVehicleSelect,
  selectedVehicleId,
  showDetailsModal = true
}: VehicleTableProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<StatusFilter[]>([]);
  const [filterMode, setFilterMode] = useState<"or" | "and">("or");

  useEffect(() => {
    const saved = localStorage.getItem("fleetFilterMode");
    if (saved === "or" || saved === "and") {
      setFilterMode(saved as "or" | "and");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("fleetFilterMode", filterMode);
  }, [filterMode]);

  const { prefetchPositionHistory, prefetchDrivers } = usePrefetchVehicleDetails();

  // Prefetch on row hover - data loads in background before click
  const handleRowHover = useCallback((vehicle: FleetVehicle) => {
    prefetchPositionHistory(vehicle.id);
    if (!vehicle.driver) {
      prefetchDrivers();
    }
  }, [prefetchPositionHistory, prefetchDrivers]);

  const handleAssignClick = (vehicle: FleetVehicle, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedVehicle(vehicle);
    setAssignDialogOpen(true);
  };

  const handleRowClick = (vehicle: FleetVehicle) => {
    setSelectedVehicle(vehicle);
    if (showDetailsModal) {
      setDetailsModalOpen(true);
    }
    // Also call onVehicleSelect if provided (for side panel selection)
    onVehicleSelect?.(vehicle);
  };

  // Event delegation for mobile cards: single click handler on container
  const handleCardsClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const raw = e.target as Node;
    const baseEl = raw.nodeType === 1 ? (raw as Element) : (raw.parentElement as Element | null);
    const cardEl = baseEl ? (baseEl.closest("[data-vehicle-id]") as HTMLElement | null) : null;
    if (!cardEl) return;
    const vid = cardEl.getAttribute("data-vehicle-id");
    if (!vid) return;
    const v = filteredVehicles.find((veh) => veh.id === vid);
    if (v) handleRowClick(v);
  };

  // Event delegation for desktop table rows
  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const raw = e.target as Node;
    const baseEl = raw.nodeType === 1 ? (raw as Element) : (raw.parentElement as Element | null);
    const rowEl = baseEl ? (baseEl.closest("[data-vehicle-id]") as HTMLElement | null) : null;
    if (!rowEl) return;
    const vid = rowEl.getAttribute("data-vehicle-id");
    if (!vid) return;
    const v = filteredVehicles.find((veh) => veh.id === vid);
    if (v) handleRowClick(v);
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

      // Multi-select status filters (OR-combined). Empty = all.
      const predicateFor = (f: StatusFilter) => {
        if (f === "online") return vehicle.status !== "offline";
        if (f === "offline") return vehicle.status === "offline";
        if (f === "moving") return vehicle.status === "moving";
        if (f === "stopped") return vehicle.status === "stopped";
        if (f === "overspeeding") return vehicle.isOverspeeding;
        if (f === "ignition_on") return vehicle.ignition === true;
        if (f === "ignition_off") return vehicle.ignition === false;
        if (f === "low_battery") return vehicle.battery !== null && vehicle.battery > 0 && vehicle.battery < 20;
        return true;
      };

      const matchesStatus =
        selectedFilters.length === 0 ||
        (filterMode === "or"
          ? selectedFilters.some(predicateFor)
          : selectedFilters.every(predicateFor));

      return matchesSearch && matchesStatus;
    });
  }, [vehicles, searchQuery, selectedFilters, filterMode]);

  // Skeleton Loading State
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[160px]" />
        </div>
        {/* Table Skeleton for Desktop */}
        <div className="hidden md:block rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        {/* Card Skeleton for Mobile */}
        <div className="md:hidden space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-[140px]" />
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-6 w-[70px]" />
                  </div>
                  <div className="text-right space-y-2">
                    <Skeleton className="h-6 w-16 ml-auto" />
                    <Skeleton className="h-4 w-12 ml-auto" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
          <div className="flex items-center gap-1.5">
            <Badge 
              variant="outline" 
              className="bg-muted/50 text-muted-foreground border-muted flex items-center gap-1"
            >
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
            {vehicle.offlineDuration && (
              <span className="text-xs text-destructive/80 font-medium">({vehicle.offlineDuration})</span>
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
  const movingCount = vehicles.filter(v => v.status === 'moving').length;
  const stoppedCount = vehicles.filter(v => v.status === 'stopped').length;
  const overspeedCount = vehicles.filter(v => v.isOverspeeding).length;
  const ignitionOnCount = vehicles.filter(v => v.ignition === true).length;
  const ignitionOffCount = vehicles.filter(v => v.ignition === false).length;
  const lowBatteryCount = vehicles.filter(v => v.battery !== null && v.battery > 0 && v.battery < 20).length;
  const hibernatedCount = vehicles.filter(v => v.vehicleStatus === "hibernated").length;

  const toggleFilter = (filter: StatusFilter) => {
    setSelectedFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  };

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Status Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-popover border border-border z-50">
              <DropdownMenuLabel>Combine filters</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={filterMode} onValueChange={(v) => setFilterMode(v as "or" | "and")}>
                <DropdownMenuRadioItem value="or">OR (match any)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="and">AND (match all)</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedFilters.length === 0}
                onCheckedChange={(checked) => {
                  if (checked) setSelectedFilters([]);
                }}
              >
                All ({vehicles.length})
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("online")}
                onCheckedChange={() => toggleFilter("online")}
              >
                Online ({onlineCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("offline")}
                onCheckedChange={() => toggleFilter("offline")}
              >
                Offline ({offlineCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("moving")}
                onCheckedChange={() => toggleFilter("moving")}
              >
                Moving ({movingCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("stopped")}
                onCheckedChange={() => toggleFilter("stopped")}
              >
                Stopped ({stoppedCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("overspeeding")}
                onCheckedChange={() => toggleFilter("overspeeding")}
              >
                Overspeed ({overspeedCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("ignition_on")}
                onCheckedChange={() => toggleFilter("ignition_on")}
              >
                Ignition ON ({ignitionOnCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("ignition_off")}
                onCheckedChange={() => toggleFilter("ignition_off")}
              >
                Ignition OFF ({ignitionOffCount})
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedFilters.includes("low_battery")}
                onCheckedChange={() => toggleFilter("low_battery")}
              >
                Low Battery ({lowBatteryCount})
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Results count */}
      {(searchQuery || selectedFilters.length > 0) && (
        <p className="text-sm text-muted-foreground mb-2">
          Showing {filteredVehicles.length} of {vehicles.length} vehicles
        </p>
      )}

      {filteredVehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Truck className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No vehicles found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {searchQuery 
              ? "We couldn't find any vehicles matching your search criteria." 
              : "Get started by adding your first vehicle to the fleet."}
          </p>
          {!searchQuery && (
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add Vehicle
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card View (delegated click handler) */}
          <div className="md:hidden space-y-3" onClick={handleCardsClick}>
            {filteredVehicles.map((v) => (
              <Card 
                key={v.id} 
                className={cn(
                  "bg-card border-border cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedVehicleId === v.id && "bg-primary/5 border-primary ring-2 ring-primary/30"
                )}
                data-vehicle-id={v.id}
                onClick={() => handleRowClick(v)}
                onMouseEnter={() => handleRowHover(v)}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{v.name}</p>
                        <p className="text-sm text-muted-foreground">{v.plate}</p>
                        {v.vehicleStatus === "hibernated" && (
                          <p className="text-xs text-amber-600 mt-1">
                            Hibernated vehicle
                          </p>
                        )}
                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                        {getStatusBadge(v)}
                        {getIgnitionIndicator(v.ignition)}
                      </div>
                      {v.driver && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Driver: {v.driver.name}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 font-mono text-lg">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        {v.speed} <span className="text-xs text-muted-foreground">km/h</span>
                      </div>
                      {getBatteryIcon(v.battery)}
                      {v.isOverspeeding && (
                        <div className="flex items-center gap-1 text-orange-500">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="text-xs">Overspeed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-hidden" onClick={handleTableClick}>
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
                  {showDetailsModal && <TableHead className="w-[60px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody onClick={handleTableClick}>
                {filteredVehicles.map((v) => (
                  <TableRow 
                    key={v.id} 
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      selectedVehicleId === v.id && "bg-primary/5 ring-2 ring-primary/30"
                    )}
                    data-vehicle-id={v.id}
                    onClick={() => handleRowClick(v)}
                    onMouseEnter={() => handleRowHover(v)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.plate}</p>
                        {v.vehicleStatus === "hibernated" && (
                          <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            Hibernated
                          </span>
                        )}
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
                    <TableCell className="max-w-[200px]">
                      <LocationCell lat={v.lat} lon={v.lon} />
                    </TableCell>
                    {showDetailsModal && (
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
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AssignDriverDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        vehicle={selectedVehicle}
        onSuccess={handleAssignmentComplete}
      />

      {showDetailsModal && (
        <VehicleDetailsModal
          open={detailsModalOpen}
          onOpenChange={setDetailsModalOpen}
          vehicle={selectedVehicle}
          onAssignmentChange={handleAssignmentComplete}
        />
      )}
    </>
  );
}
