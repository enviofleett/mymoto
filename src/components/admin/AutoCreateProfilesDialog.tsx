import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, Search, CheckSquare, Square, Users } from "lucide-react";
import {
  useGpsOwners,
  useProfiles,
  useBulkCreateProfiles,
} from "@/hooks/useAssignmentManagement";

interface AutoCreateProfilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Normalize phone number to last 10 digits for comparison
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

// Normalize name for comparison
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function AutoCreateProfilesDialog({
  open,
  onOpenChange,
}: AutoCreateProfilesDialogProps) {
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const { data: gpsOwners } = useGpsOwners();
  const { data: profiles } = useProfiles();
  const createProfilesMutation = useBulkCreateProfiles();

  // Find GPS owners without matching profiles
  const unmatchedOwners = useMemo(() => {
    if (!gpsOwners || !profiles) return [];

    // Create sets for quick lookup
    const profilePhones = new Set(
      profiles
        .filter((p) => p.phone)
        .map((p) => normalizePhone(p.phone!))
    );
    const profileNames = new Set(
      profiles.map((p) => normalizeName(p.name))
    );

    return gpsOwners.filter((owner) => {
      const ownerValue = owner.gps_owner;

      // Check if it matches any phone (normalized)
      const normalizedOwner = normalizePhone(ownerValue);
      if (normalizedOwner.length >= 10 && profilePhones.has(normalizedOwner)) {
        return false;
      }

      // Check if it matches any name
      if (profileNames.has(normalizeName(ownerValue))) {
        return false;
      }

      return true;
    });
  }, [gpsOwners, profiles]);

  // Filter by search
  const filteredOwners = useMemo(() => {
    if (!searchQuery) return unmatchedOwners;
    const query = searchQuery.toLowerCase();
    return unmatchedOwners.filter((owner) =>
      owner.gps_owner.toLowerCase().includes(query)
    );
  }, [unmatchedOwners, searchQuery]);

  const handleToggle = (ownerName: string) => {
    setSelectedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerName)) {
        next.delete(ownerName);
      } else {
        next.add(ownerName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedOwners.size === filteredOwners.length && filteredOwners.length > 0) {
      setSelectedOwners(new Set());
    } else {
      setSelectedOwners(new Set(filteredOwners.map((o) => o.gps_owner)));
    }
  };

  const handleCreate = async () => {
    const ownersToCreate = Array.from(selectedOwners);
    await createProfilesMutation.mutateAsync(ownersToCreate);
    setSelectedOwners(new Set());
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedOwners(new Set());
    setSearchQuery("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Auto-Create Profiles from GPS Owners
          </DialogTitle>
          <DialogDescription>
            Create user profiles for GPS owners that don't have matching profiles yet.
            These profiles can then be auto-assigned to their vehicles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {unmatchedOwners.length} GPS owners without profiles
            </span>
            {selectedOwners.size > 0 && (
              <Badge variant="secondary">
                {selectedOwners.size} selected
              </Badge>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search GPS owners..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Select All */}
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedOwners.size === filteredOwners.length && filteredOwners.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            Select all ({filteredOwners.length})
          </button>

          {/* Owner List */}
          <ScrollArea className="h-[300px] border rounded-lg">
            {filteredOwners.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {unmatchedOwners.length === 0 ? (
                  <>All GPS owners already have matching profiles!</>
                ) : (
                  <>No matching GPS owners found</>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredOwners.map((owner) => (
                  <div
                    key={owner.gps_owner}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedOwners.has(owner.gps_owner)
                        ? "bg-primary/10 border-primary/30"
                        : "hover:bg-muted border-transparent"
                    }`}
                    onClick={() => handleToggle(owner.gps_owner)}
                  >
                    <Checkbox
                      checked={selectedOwners.has(owner.gps_owner)}
                      onCheckedChange={() => handleToggle(owner.gps_owner)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{owner.gps_owner}</p>
                      <p className="text-xs text-muted-foreground">
                        {owner.vehicleCount} vehicle{owner.vehicleCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      New
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selectedOwners.size === 0 || createProfilesMutation.isPending}
          >
            {createProfilesMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Create {selectedOwners.size} Profile{selectedOwners.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
