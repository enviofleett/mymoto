import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  User,
  UserPlus,
  Car,
  Search,
  X,
  Check,
  Plus,
  Mail,
  Wand2,
  Users,
  UserCog,
  Edit,
  AlertCircle,
  Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  ProfileWithAssignments,
  VehicleWithAssignment,
  useProfiles,
  useVehiclesWithAssignments,
  useAssignVehicles,
  useUnassignVehicles,
  useBulkAutoAssign,
  useGpsOwners,
  useBulkCreateProfiles,
} from "@/hooks/useAssignmentManagement";
import { useCreateUserWithVehicles } from "@/hooks/useCreateUserWithVehicles";
import { useEditProfile } from "@/hooks/useEditProfile";
import { AddVehicleDialog } from "./AddVehicleDialog";

// Form schema for new user
const newUserFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
});

type NewUserFormValues = z.infer<typeof newUserFormSchema>;

interface AssignmentManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "new-user" | "existing-user" | "bulk-actions" | "edit-user";
  editProfile?: ProfileWithAssignments | null;
  selectedVehicles?: VehicleWithAssignment[];
}

// Auto-assign match helpers
function normalizePhone(phone: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-10);
}

function normalizeName(name: string | null): string {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

interface AutoMatchResult {
  vehicle: VehicleWithAssignment;
  matchedProfile: ProfileWithAssignments;
  matchType: "phone" | "name";
  matchConfidence: "exact" | "partial";
}

export function AssignmentManagerDialog({
  open,
  onOpenChange,
  initialTab = "new-user",
  editProfile = null,
  selectedVehicles = [],
}: AssignmentManagerDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set());
  const [vehicleAliases, setVehicleAliases] = useState<Record<string, string>>({});
  const [sendEmail, setSendEmail] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedVehiclesToRemove, setSelectedVehiclesToRemove] = useState<Set<string>>(new Set());
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [selectedAutoMatches, setSelectedAutoMatches] = useState<Set<string>>(new Set());
  const [autoMatchSearch, setAutoMatchSearch] = useState("");
  const [showAddVehicleDialog, setShowAddVehicleDialog] = useState(false);

  const { data: profiles } = useProfiles();
  const { data: vehicles } = useVehiclesWithAssignments(vehicleSearch, "all");
  const { data: gpsOwners } = useGpsOwners();
  const createUserMutation = useCreateUserWithVehicles();
  const editProfileMutation = useEditProfile();
  const assignMutation = useAssignVehicles();
  const autoAssignMutation = useBulkAutoAssign();
  const bulkCreateProfilesMutation = useBulkCreateProfiles();

  const form = useForm<NewUserFormValues>({
    resolver: zodResolver(newUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  // Reset form when dialog opens/closes and initialize state based on props
  useEffect(() => {
    if (!open) {
      // Reset all state when dialog closes
      form.reset();
      setVehicleSearch("");
      setSelectedVehicleIds(new Set());
      setVehicleAliases({});
      setSendEmail(true);
      setSelectedProfileId("");
      setSelectedVehiclesToRemove(new Set());
      setSelectedOwners(new Set());
      setSelectedAutoMatches(new Set());
      setAutoMatchSearch("");
      setActiveTab(initialTab);
    } else {
      // Initialize state when dialog opens based on props
      // Priority: editProfile > selectedVehicles > initialTab
      if (editProfile) {
        setActiveTab("edit-user");
        setSelectedProfileId(editProfile.id);
        setSelectedVehicleIds(new Set());
        setSelectedVehiclesToRemove(new Set());
      } else if (selectedVehicles.length > 0) {
        setActiveTab("existing-user");
        setSelectedVehicleIds(new Set(selectedVehicles.map(v => v.device_id)));
        setSelectedProfileId("");
        setSelectedVehiclesToRemove(new Set());
      } else {
        setActiveTab(initialTab);
        setSelectedVehicleIds(new Set());
        setSelectedProfileId("");
        setSelectedVehiclesToRemove(new Set());
      }
    }
  }, [open, editProfile, initialTab, selectedVehicles, form]);

  // Get vehicles for display
  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter(v =>
      v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.gps_owner?.toLowerCase().includes(vehicleSearch.toLowerCase())
    ).slice(0, 100);
  }, [vehicles, vehicleSearch]);

  // Get selected profile for edit/existing user tabs
  const selectedProfile = profiles?.find(p => p.id === selectedProfileId) || editProfile;

  // Get assigned vehicles for selected profile
  const assignedVehicles = useMemo(() => {
    if (!selectedProfile || !vehicles) return [];
    return vehicles.filter(v => v.assignedTo?.profile_id === selectedProfile.id);
  }, [selectedProfile, vehicles]);

  // Get available vehicles (unassigned or not assigned to selected profile)
  const availableVehicles = useMemo(() => {
    if (!vehicles) return [];
    if (!selectedProfile) return vehicles.filter(v => !v.assignedTo);
    return vehicles.filter(v => !v.assignedTo || v.assignedTo.profile_id !== selectedProfile.id);
  }, [vehicles, selectedProfile]);

  // Auto-assign matches
  const autoMatches = useMemo((): AutoMatchResult[] => {
    if (!vehicles || !profiles) return [];

    const results: AutoMatchResult[] = [];
    const unassignedVehicles = vehicles.filter(v => !v.assignedTo);

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

      const normalizedGpsPhone = normalizePhone(vehicle.gps_owner);
      if (normalizedGpsPhone && phoneToProfile.has(normalizedGpsPhone)) {
        results.push({
          vehicle,
          matchedProfile: phoneToProfile.get(normalizedGpsPhone)!,
          matchType: "phone",
          matchConfidence: "exact",
        });
        return;
      }

      const normalizedGpsName = normalizeName(vehicle.gps_owner);
      if (normalizedGpsName && nameToProfile.has(normalizedGpsName)) {
        results.push({
          vehicle,
          matchedProfile: nameToProfile.get(normalizedGpsName)!,
          matchType: "name",
          matchConfidence: "exact",
        });
        return;
      }

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

  // Unmatched GPS owners
  const unmatchedOwners = useMemo(() => {
    if (!gpsOwners || !profiles) return [];

    const profilePhones = new Set(
      profiles.filter(p => p.phone).map(p => normalizePhone(p.phone!))
    );
    const profileNames = new Set(profiles.map(p => normalizeName(p.name)));

    return gpsOwners.filter(owner => {
      const normalizedPhone = normalizePhone(owner.gps_owner);
      if (normalizedPhone.length >= 10 && profilePhones.has(normalizedPhone)) {
        return false;
      }
      return !profileNames.has(normalizeName(owner.gps_owner));
    });
  }, [gpsOwners, profiles]);

  // Handlers for New User tab
  const toggleVehicle = (deviceId: string) => {
    setSelectedVehicleIds(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleNewUserSubmit = async (values: NewUserFormValues) => {
    const vehicleArray = Array.from(selectedVehicleIds).map(deviceId => ({
      deviceId,
      alias: vehicleAliases[deviceId]?.trim() || undefined,
    }));

    await createUserMutation.mutateAsync({
      profile: {
        name: values.name.trim(),
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
      },
      authUser: values.password?.trim() ? { password: values.password.trim() } : null,
      vehicles: vehicleArray.length > 0 ? vehicleArray : undefined,
      sendEmail: sendEmail && values.email ? {
        to: values.email,
        userName: values.name,
        vehicleCount: vehicleArray.length,
        isNewUser: true,
      } : undefined,
    });

    onOpenChange(false);
  };

  // Handlers for Existing User tab
  const handleToggleAdd = (deviceId: string) => {
    setSelectedVehicleIds(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleToggleRemove = (deviceId: string) => {
    setSelectedVehiclesToRemove(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const handleExistingUserSave = async () => {
    if (!selectedProfile) return;

    const addVehicles = Array.from(selectedVehicleIds);
    const removeVehicles = Array.from(selectedVehiclesToRemove);

    if (addVehicles.length === 0 && removeVehicles.length === 0) {
      toast.info("No changes to save");
      return;
    }

    // Remove vehicles first
    if (removeVehicles.length > 0) {
      const { error: deleteError } = await (supabase as any)
        .from("vehicle_assignments")
        .delete()
        .in("device_id", removeVehicles)
        .eq("profile_id", selectedProfile.id);

      if (deleteError) {
        toast.error(`Failed to remove vehicles: ${deleteError.message}`);
        throw deleteError;
      }
    }

    // Add new vehicles
    if (addVehicles.length > 0) {
      const originalAssignedCount = assignedVehicles.length + removeVehicles.length;
      const isNewUser = originalAssignedCount === 0;

      await assignMutation.mutateAsync({
        deviceIds: addVehicles,
        profileId: selectedProfile.id,
        vehicleAliases,
        sendEmail: sendEmail && selectedProfile.email ? {
          to: selectedProfile.email,
          userName: selectedProfile.name,
          vehicleCount: addVehicles.length,
          isNewUser,
        } : undefined,
      });
    }

    toast.success(
      `Successfully updated assignments: ${addVehicles.length > 0 ? `+${addVehicles.length} added` : ""} ${removeVehicles.length > 0 ? `-${removeVehicles.length} removed` : ""}`
    );

    onOpenChange(false);
  };

  // Handlers for Edit User tab
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    if (selectedProfile && activeTab === "edit-user") {
      setEditName(selectedProfile.name || "");
      setEditEmail(selectedProfile.email || "");
      setEditPhone(selectedProfile.phone || "");
    }
  }, [selectedProfile, activeTab]);

  const handleEditProfileSave = async () => {
    if (!selectedProfile) return;

    await editProfileMutation.mutateAsync({
      profileId: selectedProfile.id,
      updates: {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
      },
    });

    // Also handle vehicle changes if any
    const addVehicles = Array.from(selectedVehicleIds);
    const removeVehicles = Array.from(selectedVehiclesToRemove);

    if (addVehicles.length > 0 || removeVehicles.length > 0) {
      await handleExistingUserSave();
    } else {
      onOpenChange(false);
    }
  };

  // Handlers for Bulk Actions tab
  const handleAutoAssign = async () => {
    const selectedMatchData = autoMatches
      .filter(m => selectedAutoMatches.has(m.vehicle.device_id))
      .map(m => ({
        deviceId: m.vehicle.device_id,
        profileId: m.matchedProfile.id,
      }));

    if (selectedMatchData.length === 0) return;

    await autoAssignMutation.mutateAsync(selectedMatchData);
    setSelectedAutoMatches(new Set());
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    onOpenChange(false);
  };

  const handleBulkCreateProfiles = async () => {
    const ownersToCreate = Array.from(selectedOwners);
    await bulkCreateProfilesMutation.mutateAsync(ownersToCreate);
    setSelectedOwners(new Set());
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["gps-owners"] });
    queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    onOpenChange(false);
  };

  const toggleAutoMatch = (deviceId: string) => {
    setSelectedAutoMatches(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const toggleOwner = (ownerName: string) => {
    setSelectedOwners(prev => {
      const next = new Set(prev);
      if (next.has(ownerName)) {
        next.delete(ownerName);
      } else {
        next.add(ownerName);
      }
      return next;
    });
  };

  const exactMatches = autoMatches.filter(m => m.matchConfidence === "exact");
  const partialMatches = autoMatches.filter(m => m.matchConfidence === "partial");

  // Initialize auto-select exact matches when bulk actions tab opens
  useEffect(() => {
    if (activeTab === "bulk-actions" && open && selectedAutoMatches.size === 0) {
      const exactMatchIds = exactMatches.map(m => m.vehicle.device_id);
      setSelectedAutoMatches(new Set(exactMatchIds));
    }
  }, [activeTab, open, exactMatches]);

  const hasChangesExistingUser = selectedVehicleIds.size > 0 || selectedVehiclesToRemove.size > 0;
  const hasChangesEditUser = 
    (editName !== selectedProfile?.name) ||
    (editEmail !== (selectedProfile?.email || "")) ||
    (editPhone !== (selectedProfile?.phone || "")) ||
    selectedVehicleIds.size > 0 ||
    selectedVehiclesToRemove.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            {activeTab === "new-user" && "New User & Assign Vehicles"}
            {activeTab === "existing-user" && "Assign Vehicles to Existing User"}
            {activeTab === "edit-user" && `Edit User: ${selectedProfile?.name || ""}`}
            {activeTab === "bulk-actions" && "Bulk Actions"}
          </DialogTitle>
          <DialogDescription>
            {activeTab === "new-user" && "Create a new user profile and optionally assign vehicles. You can create an auth account if password is provided."}
            {activeTab === "existing-user" && "Select a user and assign vehicles to them."}
            {activeTab === "edit-user" && "Edit user profile information and manage vehicle assignments."}
            {activeTab === "bulk-actions" && "Auto-assign vehicles or bulk create profiles from GPS owners."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="new-user">
              <UserPlus className="h-4 w-4 mr-2" />
              New User
            </TabsTrigger>
            <TabsTrigger value="existing-user">
              <Link2 className="h-4 w-4 mr-2" />
              Existing User
            </TabsTrigger>
            <TabsTrigger value="edit-user" disabled={!selectedProfile}>
              <Edit className="h-4 w-4 mr-2" />
              Edit User
            </TabsTrigger>
            <TabsTrigger value="bulk-actions">
              <Wand2 className="h-4 w-4 mr-2" />
              Bulk Actions
            </TabsTrigger>
          </TabsList>

          {/* New User Tab */}
          <TabsContent value="new-user" className="flex-1 flex flex-col overflow-hidden mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleNewUserSubmit)} className="flex-1 flex flex-col overflow-hidden space-y-4">
                {/* User Details Form */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="08012345678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="user@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Password (optional - creates auth account)</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Leave empty for profile-only" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Vehicle Selection */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Assign Vehicles (optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddVehicleDialog(true)}
                      className="h-7 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Vehicle
                    </Button>
                  </div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search vehicles..."
                      className="pl-8"
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                    />
                  </div>

                  {/* Selected Vehicles */}
                  {selectedVehicleIds.size > 0 && (
                    <div className="mb-2 p-2 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium mb-2">
                        Selected ({selectedVehicleIds.size}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {filteredVehicles
                          .filter(v => selectedVehicleIds.has(v.device_id))
                          .map(v => (
                            <Badge key={v.device_id} variant="secondary" className="gap-1 pr-1">
                              {v.device_name}
                              <Input
                                placeholder="Alias"
                                className="w-20 h-5 text-xs px-1"
                                value={vehicleAliases[v.device_id] || ""}
                                onChange={(e) => setVehicleAliases(prev => ({ ...prev, [v.device_id]: e.target.value }))}
                              />
                              <button
                                type="button"
                                onClick={() => toggleVehicle(v.device_id)}
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}

                  <ScrollArea className="flex-1 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {filteredVehicles.map(vehicle => {
                        const isSelected = selectedVehicleIds.has(vehicle.device_id);
                        return (
                          <button
                            key={vehicle.device_id}
                            type="button"
                            onClick={() => toggleVehicle(vehicle.device_id)}
                            className={`w-full text-left p-2 rounded-lg flex items-center justify-between transition-colors ${
                              isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate text-sm">{vehicle.device_name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {vehicle.device_id}
                                {vehicle.gps_owner && ` • ${vehicle.gps_owner}`}
                              </p>
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Email Notification */}
                {form.watch("email") && selectedVehicleIds.size > 0 && (
                  <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <Checkbox
                      id="send-email-new"
                      checked={sendEmail}
                      onCheckedChange={(checked) => setSendEmail(checked === true)}
                    />
                    <Label htmlFor="send-email-new" className="flex items-center gap-2 cursor-pointer text-sm">
                      <Mail className="h-4 w-4" />
                      Send email notification to {form.watch("email")} about the {selectedVehicleIds.size} vehicle(s)
                    </Label>
                  </div>
                )}

                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create User & Assign
                    {selectedVehicleIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedVehicleIds.size} vehicles
                      </Badge>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          {/* Existing User Tab */}
          <TabsContent value="existing-user" className="flex-1 flex flex-col overflow-hidden mt-4">
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              {/* User Selection */}
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles?.map(profile => (
                      <SelectItem key={profile.id} value={profile.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{profile.name}</span>
                          <span className="text-muted-foreground text-xs">
                            ({profile.assignmentCount} vehicles)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProfile && (
                <>
                  {/* User Info */}
                  <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{selectedProfile.name}</p>
                      {selectedProfile.email && (
                        <p className="text-sm text-muted-foreground">{selectedProfile.email}</p>
                      )}
                      {selectedProfile.phone && (
                        <p className="text-sm text-muted-foreground">{selectedProfile.phone}</p>
                      )}
                    </div>
                    <Badge variant="secondary">
                      {assignedVehicles.length} vehicle{assignedVehicles.length !== 1 ? "s" : ""} assigned
                    </Badge>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search vehicles..."
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {/* Email Notification */}
                  {selectedProfile.email && selectedVehicleIds.size > 0 && (
                    <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <Checkbox
                        id="send-email-existing"
                        checked={sendEmail}
                        onCheckedChange={(checked) => setSendEmail(checked === true)}
                      />
                      <Label htmlFor="send-email-existing" className="flex items-center gap-2 cursor-pointer text-sm">
                        <Mail className="h-4 w-4" />
                        Send email notification to {selectedProfile.email} about the {selectedVehicleIds.size} vehicle(s)
                      </Label>
                    </div>
                  )}

                  {/* Vehicle Lists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
                    {/* Assigned Vehicles */}
                    <div className="flex flex-col border rounded-lg overflow-hidden">
                      <div className="p-3 bg-muted/30 border-b">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <Car className="h-4 w-4" />
                          Assigned ({assignedVehicles.length})
                        </h3>
                      </div>
                      <ScrollArea className="flex-1 p-2">
                        {assignedVehicles.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            No vehicles assigned
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {assignedVehicles
                              .filter(v =>
                                v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
                                v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
                              )
                              .map(vehicle => (
                                <div
                                  key={vehicle.device_id}
                                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                    selectedVehiclesToRemove.has(vehicle.device_id)
                                      ? "bg-destructive/10 border-destructive"
                                      : "hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedVehiclesToRemove.has(vehicle.device_id)}
                                    onCheckedChange={() => handleToggleRemove(vehicle.device_id)}
                                  />
                                  <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                                  </div>
                                  {selectedVehiclesToRemove.has(vehicle.device_id) && (
                                    <X className="h-4 w-4 text-destructive shrink-0" />
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>

                    {/* Available Vehicles */}
                    <div className="flex flex-col border rounded-lg overflow-hidden">
                      <div className="p-3 bg-muted/30 border-b">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Available ({availableVehicles.length})
                        </h3>
                      </div>
                      <ScrollArea className="flex-1 p-2">
                        {availableVehicles.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            No vehicles available
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {availableVehicles
                              .filter(v =>
                                v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
                                v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
                              )
                              .map(vehicle => (
                                <div
                                  key={vehicle.device_id}
                                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                    selectedVehicleIds.has(vehicle.device_id)
                                      ? "bg-primary/10 border-primary"
                                      : "hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedVehicleIds.has(vehicle.device_id)}
                                    onCheckedChange={() => handleToggleAdd(vehicle.device_id)}
                                  />
                                  <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                                    {vehicle.assignedTo && (
                                      <p className="text-xs text-amber-500">
                                        Currently: {vehicle.assignedTo.profile_name}
                                      </p>
                                    )}
                                  </div>
                                  {selectedVehicleIds.has(vehicle.device_id) && (
                                    <Plus className="h-4 w-4 text-primary shrink-0" />
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleExistingUserSave}
                  disabled={!selectedProfile || !hasChangesExistingUser || assignMutation.isPending}
                >
                  {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                  {hasChangesExistingUser && (
                    <Badge variant="secondary" className="ml-2">
                      {selectedVehicleIds.size > 0 && `+${selectedVehicleIds.size}`}
                      {selectedVehiclesToRemove.size > 0 && `-${selectedVehiclesToRemove.size}`}
                    </Badge>
                  )}
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>

          {/* Edit User Tab */}
          <TabsContent value="edit-user" className="flex-1 flex flex-col overflow-hidden mt-4">
            {selectedProfile ? (
              <div className="space-y-4 flex-1 flex flex-col min-h-0">
                {/* Profile Edit Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="08012345678"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Vehicle Management - Reuse same UI from Existing User tab */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search vehicles..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
                  {/* Assigned Vehicles */}
                  <div className="flex flex-col border rounded-lg overflow-hidden">
                    <div className="p-3 bg-muted/30 border-b">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        Assigned ({assignedVehicles.length})
                      </h3>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      {assignedVehicles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No vehicles assigned
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {assignedVehicles
                            .filter(v =>
                              v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
                              v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
                            )
                            .map(vehicle => (
                              <div
                                key={vehicle.device_id}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                  selectedVehiclesToRemove.has(vehicle.device_id)
                                    ? "bg-destructive/10 border-destructive"
                                    : "hover:bg-muted/50"
                                }`}
                              >
                                <Checkbox
                                  checked={selectedVehiclesToRemove.has(vehicle.device_id)}
                                  onCheckedChange={() => handleToggleRemove(vehicle.device_id)}
                                />
                                <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>

                  {/* Available Vehicles */}
                  <div className="flex flex-col border rounded-lg overflow-hidden">
                    <div className="p-3 bg-muted/30 border-b">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Available ({availableVehicles.length})
                      </h3>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                      {availableVehicles.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No vehicles available
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {availableVehicles
                            .filter(v =>
                              v.device_name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
                              v.device_id.toLowerCase().includes(vehicleSearch.toLowerCase())
                            )
                            .map(vehicle => (
                              <div
                                key={vehicle.device_id}
                                className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                                  selectedVehicleIds.has(vehicle.device_id)
                                    ? "bg-primary/10 border-primary"
                                    : "hover:bg-muted/50"
                                }`}
                              >
                                <Checkbox
                                  checked={selectedVehicleIds.has(vehicle.device_id)}
                                  onCheckedChange={() => handleToggleAdd(vehicle.device_id)}
                                />
                                <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{vehicle.device_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{vehicle.device_id}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleEditProfileSave}
                    disabled={!hasChangesEditUser || editProfileMutation.isPending}
                  >
                    {(editProfileMutation.isPending || assignMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                    {hasChangesEditUser && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedVehicleIds.size > 0 && `+${selectedVehicleIds.size}`}
                        {selectedVehiclesToRemove.size > 0 && `-${selectedVehiclesToRemove.size}`}
                      </Badge>
                    )}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a user to edit</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Bulk Actions Tab */}
          <TabsContent value="bulk-actions" className="flex-1 flex flex-col overflow-hidden mt-4">
            <Tabs defaultValue="auto-assign" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="auto-assign">Auto-Assign Vehicles</TabsTrigger>
                <TabsTrigger value="create-profiles">Create Profiles</TabsTrigger>
              </TabsList>

              {/* Auto-Assign Sub-tab */}
              <TabsContent value="auto-assign" className="flex-1 flex flex-col overflow-hidden mt-4">
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
                    <p className="text-2xl font-bold text-muted-foreground">
                      {(vehicles?.filter(v => !v.assignedTo).length || 0) - autoMatches.length}
                    </p>
                    <p className="text-xs text-muted-foreground">No Match Found</p>
                  </div>
                </div>

                {autoMatches.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No matches found</p>
                      <p className="text-sm mt-1">
                        Could not match any unassigned vehicles to existing user profiles.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by vehicle name, GPS owner, or user name..."
                        value={autoMatchSearch}
                        onChange={(e) => setAutoMatchSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>

                    {/* Select All */}
                    <div className="flex items-center justify-between py-2 border-b">
                      <button
                        onClick={() => {
                          if (selectedAutoMatches.size === autoMatches.length) {
                            setSelectedAutoMatches(new Set());
                          } else {
                            setSelectedAutoMatches(new Set(autoMatches.map(m => m.vehicle.device_id)));
                          }
                        }}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <Checkbox
                          checked={selectedAutoMatches.size === autoMatches.length && autoMatches.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedAutoMatches(new Set(autoMatches.map(m => m.vehicle.device_id)));
                            } else {
                              setSelectedAutoMatches(new Set());
                            }
                          }}
                        />
                        Select all ({autoMatches.length} matches)
                      </button>
                      <span className="text-sm text-muted-foreground">
                        {selectedAutoMatches.size} selected
                      </span>
                    </div>

                    {/* Match List */}
                    <ScrollArea className="flex-1 -mx-6 px-6">
                      <div className="space-y-2 py-2">
                        {autoMatches
                          .filter(match => {
                            const searchLower = autoMatchSearch.toLowerCase();
                            return (
                              match.vehicle.device_name.toLowerCase().includes(searchLower) ||
                              match.vehicle.device_id.toLowerCase().includes(searchLower) ||
                              match.vehicle.gps_owner?.toLowerCase().includes(searchLower) ||
                              match.matchedProfile.name.toLowerCase().includes(searchLower) ||
                              match.matchedProfile.email?.toLowerCase().includes(searchLower) ||
                              match.matchedProfile.phone?.toLowerCase().includes(searchLower)
                            );
                          })
                          .map(match => (
                          <div
                            key={match.vehicle.device_id}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                              selectedAutoMatches.has(match.vehicle.device_id)
                                ? "bg-primary/5 border-primary/30"
                                : "hover:bg-muted/50"
                            }`}
                            onClick={() => toggleAutoMatch(match.vehicle.device_id)}
                          >
                            <Checkbox
                              checked={selectedAutoMatches.has(match.vehicle.device_id)}
                              onCheckedChange={() => toggleAutoMatch(match.vehicle.device_id)}
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
                            <div className="shrink-0">
                              {match.matchConfidence === "exact" ? (
                                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                  <Check className="h-3 w-3 mr-1" />
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

                    <DialogFooter>
                      <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAutoAssign}
                        disabled={selectedAutoMatches.size === 0 || autoAssignMutation.isPending}
                      >
                        {autoAssignMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Assigning...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            Assign {selectedAutoMatches.size} Vehicle(s)
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </TabsContent>

              {/* Create Profiles Sub-tab */}
              <TabsContent value="create-profiles" className="flex-1 flex flex-col overflow-hidden mt-4">
                <div className="space-y-3 flex-1 flex flex-col min-h-0">
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
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {/* Select All */}
                  <button
                    onClick={() => {
                      const filtered = unmatchedOwners.filter(o =>
                        o.gps_owner.toLowerCase().includes(vehicleSearch.toLowerCase())
                      );
                      if (selectedOwners.size === filtered.length && filtered.length > 0) {
                        setSelectedOwners(new Set());
                      } else {
                        setSelectedOwners(new Set(filtered.map(o => o.gps_owner)));
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Checkbox
                      checked={
                        selectedOwners.size === unmatchedOwners.filter(o =>
                          o.gps_owner.toLowerCase().includes(vehicleSearch.toLowerCase())
                        ).length &&
                        unmatchedOwners.filter(o =>
                          o.gps_owner.toLowerCase().includes(vehicleSearch.toLowerCase())
                        ).length > 0
                      }
                    />
                    Select all
                  </button>

                  {/* Owner List */}
                  <ScrollArea className="flex-1 border rounded-lg">
                    {unmatchedOwners.filter(o =>
                      o.gps_owner.toLowerCase().includes(vehicleSearch.toLowerCase())
                    ).length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        {unmatchedOwners.length === 0
                          ? "All GPS owners already have matching profiles!"
                          : "No matching GPS owners found"}
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {unmatchedOwners
                          .filter(o =>
                            o.gps_owner.toLowerCase().includes(vehicleSearch.toLowerCase())
                          )
                          .map(owner => (
                            <div
                              key={owner.gps_owner}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedOwners.has(owner.gps_owner)
                                  ? "bg-primary/10 border-primary/30"
                                  : "hover:bg-muted border-transparent"
                              }`}
                              onClick={() => toggleOwner(owner.gps_owner)}
                            >
                              <Checkbox
                                checked={selectedOwners.has(owner.gps_owner)}
                                onCheckedChange={() => toggleOwner(owner.gps_owner)}
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

                <DialogFooter>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkCreateProfiles}
                    disabled={selectedOwners.size === 0 || bulkCreateProfilesMutation.isPending}
                  >
                    {bulkCreateProfilesMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Create {selectedOwners.size} Profile{selectedOwners.size !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Add Vehicle Dialog */}
      <AddVehicleDialog
        open={showAddVehicleDialog}
        onOpenChange={(open) => {
          setShowAddVehicleDialog(open);
          if (!open) {
            // Refresh vehicle list when dialog closes
            queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
          }
        }}
      />
    </Dialog>
  );
}
