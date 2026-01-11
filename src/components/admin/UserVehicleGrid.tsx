import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Car,
  User,
  Search,
  UserPlus,
  Link2,
  Unlink,
  CheckSquare,
  Square,
  Loader2,
  Wand2,
} from "lucide-react";
import {
  ProfileWithAssignments,
  VehicleWithAssignment,
  useProfiles,
  useVehiclesWithAssignments,
  useUnassignVehicles,
  useBulkAutoAssign,
} from "@/hooks/useAssignmentManagement";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { CreateProfileDialog } from "./CreateProfileDialog";
import { AutoAssignDialog } from "./AutoAssignDialog";

export function UserVehicleGrid() {
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [userSearch, setUserSearch] = useState("");
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);
  const [showAutoAssignDialog, setShowAutoAssignDialog] = useState(false);

  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: vehicles, isLoading: vehiclesLoading } = useVehiclesWithAssignments(vehicleSearch, vehicleFilter);
  const unassignMutation = useUnassignVehicles();
  const autoAssignMutation = useBulkAutoAssign();

  // Filter profiles by search
  const filteredProfiles = profiles?.filter(p =>
    p.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    p.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    p.phone?.includes(userSearch)
  ) || [];

  // Filter vehicles by selected user
  const displayVehicles = selectedUserId
    ? vehicles?.filter(v => v.assignedTo?.profile_id === selectedUserId)
    : vehicles;

  const handleVehicleSelect = (deviceId: string) => {
    setSelectedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!displayVehicles) return;
    if (selectedVehicles.size === displayVehicles.length) {
      setSelectedVehicles(new Set());
    } else {
      setSelectedVehicles(new Set(displayVehicles.map(v => v.device_id)));
    }
  };

  const handleUnassign = async () => {
    const deviceIds = Array.from(selectedVehicles);
    await unassignMutation.mutateAsync(deviceIds);
    setSelectedVehicles(new Set());
  };

  const getSelectedVehicleObjects = (): VehicleWithAssignment[] => {
    return vehicles?.filter(v => selectedVehicles.has(v.device_id)) || [];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-280px)]">
      {/* Left Panel - Users */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
        <div className="p-3 border-b bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" />
              Users
            </h3>
            <Button size="sm" variant="outline" onClick={() => setShowCreateProfileDialog(true)}>
              <UserPlus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-8 h-9"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {profilesLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {/* "All vehicles" option */}
              <button
                onClick={() => setSelectedUserId(null)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedUserId === null
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">All Vehicles</span>
                  <Badge variant="secondary">{vehicles?.length || 0}</Badge>
                </div>
              </button>

              {filteredProfiles.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedUserId(profile.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedUserId === profile.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{profile.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {profile.email || profile.phone || "No contact info"}
                      </p>
                    </div>
                    <Badge
                      variant={profile.assignmentCount > 0 ? "default" : "secondary"}
                    >
                      {profile.assignmentCount}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Vehicles */}
      <div className="lg:col-span-2 border rounded-lg bg-card overflow-hidden flex flex-col">
        <div className="p-3 border-b bg-muted/30 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Car className="h-4 w-4" />
              Vehicles
              {selectedUserId && (
                <span className="text-muted-foreground font-normal">
                  for {filteredProfiles.find(p => p.id === selectedUserId)?.name}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowAutoAssignDialog(true)}
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Auto-Assign
              </Button>
              {selectedVehicles.size > 0 && (
                <>
                  <Button
                    size="sm"
                    onClick={() => setShowAssignDialog(true)}
                  >
                    <Link2 className="h-4 w-4 mr-1" />
                    Assign ({selectedVehicles.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUnassign}
                    disabled={unassignMutation.isPending}
                  >
                    {unassignMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4 mr-1" />
                    )}
                    Unassign
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                className="pl-8 h-9"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
              />
            </div>
            <Select
              value={vehicleFilter}
              onValueChange={(v) => setVehicleFilter(v as typeof vehicleFilter)}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Select All Bar */}
        <div className="px-3 py-2 border-b bg-muted/10 flex items-center justify-between text-sm">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {displayVehicles && selectedVehicles.size === displayVehicles.length ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Select all ({displayVehicles?.length || 0})
          </button>
          {selectedVehicles.size > 0 && (
            <span className="text-muted-foreground">
              {selectedVehicles.size} selected
            </span>
          )}
        </div>

        <ScrollArea className="flex-1">
          {vehiclesLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : displayVehicles?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No vehicles found</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {displayVehicles?.map(vehicle => (
                <div
                  key={vehicle.device_id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    selectedVehicles.has(vehicle.device_id)
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={selectedVehicles.has(vehicle.device_id)}
                    onCheckedChange={() => handleVehicleSelect(vehicle.device_id)}
                  />
                  <Car className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{vehicle.device_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {vehicle.device_id}
                      {vehicle.gps_owner && ` • ${vehicle.gps_owner}`}
                    </p>
                  </div>
                  {vehicle.assignedTo ? (
                    <Badge variant="default" className="shrink-0">
                      <User className="h-3 w-3 mr-1" />
                      {vehicle.assignedTo.profile_name}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      Unassigned
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Dialogs */}
      <BulkAssignDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        selectedVehicles={getSelectedVehicleObjects()}
        profiles={profiles || []}
        onSuccess={() => setSelectedVehicles(new Set())}
      />

      <CreateProfileDialog
        open={showCreateProfileDialog}
        onOpenChange={setShowCreateProfileDialog}
      />

      <AutoAssignDialog
        open={showAutoAssignDialog}
        onOpenChange={setShowAutoAssignDialog}
        vehicles={vehicles || []}
        profiles={profiles || []}
        onAssign={async (matches) => {
          await autoAssignMutation.mutateAsync(matches);
        }}
      />
    </div>
  );
}
