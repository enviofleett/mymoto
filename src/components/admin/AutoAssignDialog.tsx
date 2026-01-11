import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wand2, User, Car, CheckCircle, AlertCircle } from "lucide-react";
import { ProfileWithAssignments, VehicleWithAssignment } from "@/hooks/useAssignmentManagement";

interface AutoMatchResult {
  vehicle: VehicleWithAssignment;
  matchedProfile: ProfileWithAssignments;
  matchType: "phone" | "name";
  matchConfidence: "exact" | "partial";
}

interface AutoAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: VehicleWithAssignment[];
  profiles: ProfileWithAssignments[];
  onAssign: (matches: { deviceId: string; profileId: string }[]) => Promise<void>;
}

function normalizePhone(phone: string | null): string {
  if (!phone) return "";
  // Remove all non-digit characters and get last 10 digits
  return phone.replace(/\D/g, "").slice(-10);
}

function normalizeName(name: string | null): string {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function AutoAssignDialog({
  open,
  onOpenChange,
  vehicles,
  profiles,
  onAssign,
}: AutoAssignDialogProps) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  // Find matches between unassigned vehicles and profiles
  const matches = useMemo(() => {
    const results: AutoMatchResult[] = [];
    const unassignedVehicles = vehicles.filter(v => !v.assignedTo);

    // Build lookup maps for profiles
    const phoneToProfile = new Map<string, ProfileWithAssignments>();
    const nameToProfile = new Map<string, ProfileWithAssignments>();

    profiles.forEach(profile => {
      const normalizedPhone = normalizePhone(profile.phone);
      if (normalizedPhone) {
        phoneToProfile.set(normalizedPhone, profile);
      }
      const normalizedName = normalizeName(profile.name);
      if (normalizedName) {
        nameToProfile.set(normalizedName, profile);
      }
    });

    unassignedVehicles.forEach(vehicle => {
      if (!vehicle.gps_owner) return;

      const gpsOwner = vehicle.gps_owner;
      
      // Try phone match first (higher priority)
      const normalizedGpsPhone = normalizePhone(gpsOwner);
      if (normalizedGpsPhone && phoneToProfile.has(normalizedGpsPhone)) {
        results.push({
          vehicle,
          matchedProfile: phoneToProfile.get(normalizedGpsPhone)!,
          matchType: "phone",
          matchConfidence: "exact",
        });
        return;
      }

      // Try exact name match
      const normalizedGpsName = normalizeName(gpsOwner);
      if (normalizedGpsName && nameToProfile.has(normalizedGpsName)) {
        results.push({
          vehicle,
          matchedProfile: nameToProfile.get(normalizedGpsName)!,
          matchType: "name",
          matchConfidence: "exact",
        });
        return;
      }

      // Try partial name match (gps_owner contains profile name or vice versa)
      for (const [profileName, profile] of nameToProfile.entries()) {
        if (
          normalizedGpsName.includes(profileName) ||
          profileName.includes(normalizedGpsName)
        ) {
          results.push({
            vehicle,
            matchedProfile: profile,
            matchType: "name",
            matchConfidence: "partial",
          });
          return;
        }
      }
    });

    return results;
  }, [vehicles, profiles]);

  // Initialize selected matches when dialog opens
  useMemo(() => {
    if (open) {
      // Auto-select exact matches
      const exactMatches = matches
        .filter(m => m.matchConfidence === "exact")
        .map(m => m.vehicle.device_id);
      setSelectedMatches(new Set(exactMatches));
    }
  }, [open, matches]);

  const handleToggleMatch = (deviceId: string) => {
    setSelectedMatches(prev => {
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
    if (selectedMatches.size === matches.length) {
      setSelectedMatches(new Set());
    } else {
      setSelectedMatches(new Set(matches.map(m => m.vehicle.device_id)));
    }
  };

  const handleAssign = async () => {
    const selectedMatchData = matches
      .filter(m => selectedMatches.has(m.vehicle.device_id))
      .map(m => ({
        deviceId: m.vehicle.device_id,
        profileId: m.matchedProfile.id,
      }));

    if (selectedMatchData.length === 0) return;

    setIsAssigning(true);
    try {
      await onAssign(selectedMatchData);
      onOpenChange(false);
    } finally {
      setIsAssigning(false);
    }
  };

  const exactMatches = matches.filter(m => m.matchConfidence === "exact");
  const partialMatches = matches.filter(m => m.matchConfidence === "partial");
  const unassignedCount = vehicles.filter(v => !v.assignedTo).length;
  const unmatchedCount = unassignedCount - matches.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Auto-Assign Vehicles
          </DialogTitle>
          <DialogDescription>
            Matches vehicles to users based on GPS owner field matching profile phone numbers or names.
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-500">{exactMatches.length}</p>
            <p className="text-xs text-muted-foreground">Exact Matches</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-500">{partialMatches.length}</p>
            <p className="text-xs text-muted-foreground">Partial Matches</p>
          </div>
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{unmatchedCount}</p>
            <p className="text-xs text-muted-foreground">No Match Found</p>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No matches found</p>
            <p className="text-sm mt-1">
              Could not match any unassigned vehicles to existing user profiles.
              <br />
              Try creating profiles with matching phone numbers first.
            </p>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center justify-between py-2 border-b">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Checkbox
                  checked={selectedMatches.size === matches.length}
                  onCheckedChange={handleSelectAll}
                />
                Select all ({matches.length} matches)
              </button>
              <span className="text-sm text-muted-foreground">
                {selectedMatches.size} selected
              </span>
            </div>

            {/* Match List */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2 py-2">
                {matches.map(match => (
                  <div
                    key={match.vehicle.device_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      selectedMatches.has(match.vehicle.device_id)
                        ? "bg-primary/5 border-primary/30"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleToggleMatch(match.vehicle.device_id)}
                  >
                    <Checkbox
                      checked={selectedMatches.has(match.vehicle.device_id)}
                      onCheckedChange={() => handleToggleMatch(match.vehicle.device_id)}
                    />
                    
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                      {/* Vehicle */}
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate text-sm">
                            {match.vehicle.device_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            Owner: {match.vehicle.gps_owner}
                          </p>
                        </div>
                      </div>

                      {/* Profile */}
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate text-sm">
                            {match.matchedProfile.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {match.matchedProfile.phone || match.matchedProfile.email || "No contact"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Match Badge */}
                    <div className="shrink-0 flex items-center gap-1">
                      {match.matchConfidence === "exact" ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {match.matchType === "phone" ? "Phone" : "Name"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                          Partial
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selectedMatches.size === 0 || isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Assign {selectedMatches.size} Vehicle(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
