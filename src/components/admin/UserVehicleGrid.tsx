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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Users,
  AlertTriangle,
  Phone,
  UsersRound,
} from "lucide-react";
import {
  ProfileWithAssignments,
  VehicleWithAssignment,
  useProfiles,
  useVehiclesWithAssignments,
  useUnassignVehicles,
  useBulkAutoAssign,
  useGpsOwners,
  useUnassignAllVehicles,
} from "@/hooks/useAssignmentManagement";
import { BulkAssignDialog } from "./BulkAssignDialog";
import { CreateProfileDialog } from "./CreateProfileDialog";
import { AutoAssignDialog } from "./AutoAssignDialog";
import { AutoCreateProfilesDialog } from "./AutoCreateProfilesDialog";

export function UserVehicleGrid() {
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [userSearch, setUserSearch] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGpsOwner, setSelectedGpsOwner] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);
  const [showAutoAssignDialog, setShowAutoAssignDialog] = useState(false);
  const [showAutoCreateProfilesDialog, setShowAutoCreateProfilesDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "gps-owners">("users");

  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: vehicles, isLoading: vehiclesLoading } = useVehiclesWithAssignments(vehicleSearch, vehicleFilter);
  const { data: gpsOwners, isLoading: ownersLoading } = useGpsOwners();
  const unassignMutation = useUnassignVehicles();
  const unassignAllMutation = useUnassignAllVehicles();
  const autoAssignMutation = useBulkAutoAssign();

  // Filter profiles by search
  const filteredProfiles = profiles?.filter(p =>
    p.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    p.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    p.phone?.includes(userSearch)
  ) || [];

  // Filter GPS owners by search
  const filteredGpsOwners = gpsOwners?.filter(o =>
    o.gps_owner.toLowerCase().includes(ownerSearch.toLowerCase())
  ) || [];

  // Filter vehicles based on selection
  const displayVehicles = (() => {
    let filtered = vehicles || [];
    if (selectedUserId) {
      filtered = filtered.filter(v => v.assignedTo?.profile_id === selectedUserId);
    } else if (selectedGpsOwner) {
      filtered = filtered.filter(v => v.gps_owner === selectedGpsOwner);
    }
    return filtered;
  })();

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
    if (selectedVehicles.size === displayVehicles.length && displayVehicles.length > 0) {
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

  const handleUnassignAll = async () => {
    await unassignAllMutation.mutateAsync();
    setSelectedVehicles(new Set());
    setSelectedUserId(null);
  };

  const getSelectedVehicleObjects = (): VehicleWithAssignment[] => {
    return vehicles?.filter(v => selectedVehicles.has(v.device_id)) || [];
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "users" | "gps-owners");
    setSelectedUserId(null);
    setSelectedGpsOwner(null);
    setSelectedVehicles(new Set());
  };

  const assignedCount = vehicles?.filter(v => v.assignedTo !== null).length || 0;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 min-h-[500px] lg:h-[calc(100vh-280px)]">
      {/* Left Panel - Users/GPS Owners */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col h-[300px] lg:h-full">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
          <div className="p-2 sm:p-3 border-b bg-muted/30 space-y-2">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="users" className="text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Users
              </TabsTrigger>
              <TabsTrigger value="gps-owners" className="text-xs sm:text-sm">
                <Phone className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                GPS Owners
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="users" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            <div className="p-2 sm:p-3 border-b space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="pl-8 h-9 text-sm"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowCreateProfileDialog(true)}>
                  <UserPlus className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Add</span>
                </Button>
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
                  <button
                    onClick={() => { setSelectedUserId(null); setSelectedGpsOwner(null); }}
                    className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${
                      selectedUserId === null && selectedGpsOwner === null
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">All Vehicles</span>
                      <Badge variant="secondary" className="text-xs">{vehicles?.length || 0}</Badge>
                    </div>
                  </button>

                  {filteredProfiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => { setSelectedUserId(profile.id); setSelectedGpsOwner(null); }}
                      className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${
                        selectedUserId === profile.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">{profile.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {profile.email || profile.phone || "No contact"}
                          </p>
                        </div>
                        <Badge
                          variant={profile.assignmentCount > 0 ? "default" : "secondary"}
                          className="text-xs shrink-0"
                        >
                          {profile.assignmentCount}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="gps-owners" className="flex-1 flex flex-col m-0 data-[state=inactive]:hidden">
            <div className="p-2 sm:p-3 border-b space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search GPS owners..."
                    className="pl-8 h-9 text-sm"
                    value={ownerSearch}
                    onChange={(e) => setOwnerSearch(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAutoCreateProfilesDialog(true)}>
                  <UsersRound className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Create Profiles</span>
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              {ownersLoading ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => { setSelectedGpsOwner(null); setSelectedUserId(null); }}
                    className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${
                      selectedGpsOwner === null && selectedUserId === null
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">All GPS Owners</span>
                      <Badge variant="secondary" className="text-xs">{gpsOwners?.length || 0}</Badge>
                    </div>
                  </button>

                  {filteredGpsOwners.map(owner => (
                    <button
                      key={owner.gps_owner}
                      onClick={() => { setSelectedGpsOwner(owner.gps_owner); setSelectedUserId(null); }}
                      className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors ${
                        selectedGpsOwner === owner.gps_owner
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-sm">{owner.gps_owner}</p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {owner.vehicleCount} vehicles
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Panel - Vehicles */}
      <div className="lg:col-span-2 border rounded-lg bg-card overflow-hidden flex flex-col h-[400px] lg:h-full">
        <div className="p-2 sm:p-3 border-b bg-muted/30 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
              <Car className="h-4 w-4" />
              Vehicles
              {(selectedUserId || selectedGpsOwner) && (
                <span className="text-muted-foreground font-normal text-xs sm:text-sm">
                  ({displayVehicles.length})
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowAutoAssignDialog(true)}
                className="text-xs sm:text-sm h-8"
              >
                <Wand2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Auto-Assign</span>
                <span className="sm:hidden">Auto</span>
              </Button>

              {/* Unassign All Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={assignedCount === 0}
                    className="text-xs sm:text-sm h-8"
                  >
                    <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    <span className="hidden sm:inline">Reset All ({assignedCount})</span>
                    <span className="sm:hidden">Reset</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset All Assignments?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will unassign ALL {assignedCount} vehicles from their users. 
                      Users will no longer see any vehicles in their PWA until you reassign them.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleUnassignAll}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {unassignAllMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Yes, Reset All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Search and Filter Row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                className="pl-8 h-9 text-sm"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
              />
            </div>
            <Select
              value={vehicleFilter}
              onValueChange={(v) => setVehicleFilter(v as typeof vehicleFilter)}
            >
              <SelectTrigger className="w-28 sm:w-36 h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selected Actions */}
          {selectedVehicles.size > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => setShowAssignDialog(true)}
                className="text-xs sm:text-sm h-8"
              >
                <Link2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Assign ({selectedVehicles.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUnassign}
                disabled={unassignMutation.isPending}
                className="text-xs sm:text-sm h-8"
              >
                {unassignMutation.isPending ? (
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                ) : (
                  <Unlink className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                )}
                Unassign
              </Button>
            </div>
          )}
        </div>

        {/* Select All Bar */}
        <div className="px-2 sm:px-3 py-2 border-b bg-muted/10 flex items-center justify-between text-xs sm:text-sm">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {displayVehicles && selectedVehicles.size === displayVehicles.length && displayVehicles.length > 0 ? (
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
              <p className="text-sm">No vehicles found</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {displayVehicles?.map(vehicle => (
                <div
                  key={vehicle.device_id}
                  className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-colors ${
                    selectedVehicles.has(vehicle.device_id)
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={selectedVehicles.has(vehicle.device_id)}
                    onCheckedChange={() => handleVehicleSelect(vehicle.device_id)}
                  />
                  <Car className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{vehicle.device_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {vehicle.device_id}
                      {vehicle.gps_owner && (
                        <span className="text-primary"> • {vehicle.gps_owner}</span>
                      )}
                    </p>
                  </div>
                  {vehicle.assignedTo ? (
                    <Badge variant="default" className="shrink-0 text-xs">
                      <User className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">{vehicle.assignedTo.profile_name}</span>
                      <span className="sm:hidden">Assigned</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-xs">
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

      <AutoCreateProfilesDialog
        open={showAutoCreateProfilesDialog}
        onOpenChange={setShowAutoCreateProfilesDialog}
      />
    </div>
  );
}
