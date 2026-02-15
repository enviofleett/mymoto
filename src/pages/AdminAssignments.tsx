import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, Plus, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useLinkProfileUser, useProfiles, useVehiclesWithAssignments } from "@/hooks/useAssignmentManagement";
import { AssignmentManagerDialog } from "@/components/admin/AssignmentManagerDialog";
import { CreateTestUserDialog } from "@/components/admin/CreateTestUserDialog";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";

export default function AdminAssignments() {
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useVehiclesWithAssignments("", "all");
  const [syncing, setSyncing] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importedOpen, setImportedOpen] = useState(false);
  const [importedSearch, setImportedSearch] = useState("");
  const [importedVehicles, setImportedVehicles] = useState<Array<{
    device_id: string;
    device_name: string;
    sim_number: string | null;
    device_type: string | null;
    group_name: string | null;
    group_id: string | null;
    gps_owner: string | null;
  }>>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [usersSearch, setUsersSearch] = useState("");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const linkProfileMutation = useLinkProfileUser();
  const { data: wallets = [], isLoading: walletsLoading } = useQuery({
    queryKey: ["admin-wallets-basic"],
    queryFn: async () => {
      // Wallet schema differs across environments: some have wallets.user_id, some wallets.profile_id.
      // Try user_id first, then fall back to profile_id on "column does not exist" errors.
      const tryUserId = await (supabase as any)
        .from("wallets")
        .select("user_id,balance");
      if (!tryUserId.error) {
        return (tryUserId.data || []) as Array<{ user_id: string; balance: number }>;
      }

      if (tryUserId.error?.code === "42703") {
        const tryProfileId = await (supabase as any)
          .from("wallets")
          .select("profile_id,balance");
        if (tryProfileId.error) {
          console.warn("[AdminAssignments] wallets query failed:", tryProfileId.error);
          return [] as Array<{ user_id: string; balance: number }>;
        }
        // Normalize shape to { user_id, balance } for the existing walletMap logic.
        return (tryProfileId.data || []).map((r: any) => ({
          user_id: r.profile_id,
          balance: r.balance,
        })) as Array<{ user_id: string; balance: number }>;
      }

      console.warn("[AdminAssignments] wallets query failed:", tryUserId.error);
      return [] as Array<{ user_id: string; balance: number }>;
    },
  });

  const handleSyncVehicles = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gps-data', {
        body: {
          action: 'querymonitorlist',
        },
      });

      if (error) {
        throw error;
      }

      if (data && typeof data === 'object' && 'error' in data) {
        const errorMessage = (data as any).error || 'Unknown error';
        throw new Error(errorMessage);
      }

      if (!data) {
        throw new Error('No response data received from GPS51 sync');
      }

      const count = Array.isArray((data as any)?.data?.groups)
        ? ((data as any).data.groups.flatMap((g: any) => g.devices || []).length || 0)
        : 0;
      setImportedCount(count);
      const devices = Array.isArray((data as any)?.data?.groups)
        ? (data as any).data.groups.flatMap((g: any) => g.devices || [])
        : [];
      const imported = devices.map((d: any) => ({
        device_id: d.deviceid,
        device_name: d.devicename || d.deviceid,
        sim_number: d.simnumber || null,
        device_type: d.devicetype || null,
        group_name: d.groupname || null,
        group_id: d.groupid || null,
        gps_owner: d.creater || null,
      }));
      setImportedVehicles(imported);
      setImportedOpen(true);
      toast.success(`Vehicles synced successfully from GPS51 (${count} imported)`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('Vehicle sync error:', error);
      const errorMessage = error?.message || error?.error || (typeof error === 'string' ? error : 'Unknown error');
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      setSyncing(false);
    }
  };

  const walletMap = useMemo(() => {
    const map = new Map<string, number>();
    wallets.forEach(w => {
      if (w.user_id) map.set(w.user_id, Number(w.balance) || 0);
    });
    return map;
  }, [wallets]);

  const assignmentsByProfile = useMemo(() => {
    const map = new Map<string, { count: number; names: string[] }>();
    vehicles.forEach(v => {
      const a = v.assignedTo;
      if (a?.profile_id) {
        const entry = map.get(a.profile_id) || { count: 0, names: [] };
        entry.count += 1;
        entry.names.push(v.device_name || v.device_id);
        map.set(a.profile_id, entry);
      }
    });
    return map;
  }, [vehicles]);

  const selectedProfile = selectedProfileId ? profiles.find(p => p.id === selectedProfileId) || null : null;
  const selectedProfileVehicles = selectedProfile
    ? vehicles.filter(v => v.assignedTo?.profile_id === selectedProfile.id)
    : [];
  const selectedVehicle = selectedVehicleId ? vehicles.find(v => v.device_id === selectedVehicleId) || null : null;
  const filteredProfiles = useMemo(() => {
    if (!usersSearch) return profiles;
    const q = usersSearch.toLowerCase();
    return profiles.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const emailMatch = (p.email || "").toLowerCase().includes(q);
      const assignInfo = assignmentsByProfile.get(p.id) || { names: [] as string[], count: 0 };
      const vehicleMatch = assignInfo.names.some(n => n.toLowerCase().includes(q));
      return nameMatch || emailMatch || vehicleMatch;
    });
  }, [profiles, usersSearch, assignmentsByProfile]);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Users & Vehicles</h1>
            <p className="text-muted-foreground">Add test users and view vehicles and subscription status</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSyncVehicles}
              disabled={syncing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing
                ? (importedCount !== null ? `Syncing... (${importedCount})` : 'Syncing...')
                : (importedCount !== null ? `Sync from GPS51 (${importedCount} imported)` : 'Sync from GPS51')}
            </Button>
            <Button
              onClick={() => setCreateUserOpen(true)}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Test User
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>View vehicles and subscription status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Input
                  placeholder="Search users or vehicles..."
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            {profilesLoading || vehiclesLoading || walletsLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No users found</p>
              </div>
            ) : (
              <ResponsiveDataList
                items={filteredProfiles}
                desktop={
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Vehicles</TableHead>
                          <TableHead>Subscription</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProfiles.map(p => {
                          const assignInfo = assignmentsByProfile.get(p.id) || { count: 0, names: [] };
                          const balance = p.user_id ? walletMap.get(p.user_id) ?? null : null;
                          const subActive = typeof balance === "number" ? balance > 0 : false;
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">{p.name}</div>
                                  <Badge variant={p.user_id ? "default" : "secondary"} className="text-[10px] px-2 py-0">
                                    {p.user_id ? "Linked" : "Unlinked"}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">{p.email || "No email"}</div>
                                {!p.user_id ? (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      User cannot see vehicles in PWA until linked
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      disabled={!p.email || linkProfileMutation.isPending}
                                      onClick={async () => {
                                        await linkProfileMutation.mutateAsync(p.id);
                                      }}
                                      title={
                                        p.email
                                          ? "Link profile to an existing auth user with this email"
                                          : "Add an email to this profile first (Edit User), then link"
                                      }
                                    >
                                      <Link2 className="h-3 w-3 mr-1" />
                                      Link
                                    </Button>
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setSelectedProfileId(p.id);
                                      setDialogOpen(true);
                                    }}
                                    className="inline-flex items-center"
                                    title="Assign vehicles"
                                  >
                                    <Badge variant={assignInfo.count > 0 ? "default" : "secondary"}>
                                      {assignInfo.count}
                                    </Badge>
                                  </button>
                                  <div className="flex gap-1 flex-wrap max-w-[260px]">
                                    {vehicles
                                      .filter(v => v.assignedTo?.profile_id === p.id)
                                      .slice(0, 3)
                                      .map(v => (
                                        <button
                                          key={v.device_id}
                                          className="text-xs text-muted-foreground hover:underline"
                                          title="View vehicle details"
                                          onClick={() => setSelectedVehicleId(v.device_id)}
                                        >
                                          {v.device_name}
                                        </button>
                                      ))}
                                    {assignInfo.names.length > 3 ? <span className="text-xs text-muted-foreground">…</span> : null}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {balance === null ? (
                                  <Badge variant="outline">No Wallet</Badge>
                                ) : subActive ? (
                                  <Badge className="bg-green-600 text-white">Active</Badge>
                                ) : (
                                  <Badge className="bg-amber-500 text-white">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedProfileId(p.id);
                                      setDialogOpen(true);
                                    }}
                                  >
                                    <Link2 className="h-4 w-4 mr-1" />
                                    Assign
                                  </Button>
                                  {assignInfo.count > 0 ? (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        const first = vehicles.find(v => v.assignedTo?.profile_id === p.id);
                                        if (first) setSelectedVehicleId(first.device_id);
                                      }}
                                    >
                                      View Vehicle
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                }
                renderCard={(p) => {
                  const assignInfo = assignmentsByProfile.get(p.id) || { count: 0, names: [] };
                  const balance = p.user_id ? walletMap.get(p.user_id) ?? null : null;
                  const subActive = typeof balance === "number" ? balance > 0 : false;
                  return (
                    <Card key={p.id} className="bg-card border-border">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{p.email || "No email"}</div>
                          </div>
                          <Badge variant={p.user_id ? "default" : "secondary"} className="shrink-0 text-[10px] px-2 py-0">
                            {p.user_id ? "Linked" : "Unlinked"}
                          </Badge>
                        </div>

                        {!p.user_id ? (
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              Link required for PWA visibility
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              disabled={!p.email || linkProfileMutation.isPending}
                              onClick={async () => {
                                await linkProfileMutation.mutateAsync(p.id);
                              }}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              Link
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">Vehicles</div>
                          <Badge variant={assignInfo.count > 0 ? "default" : "secondary"}>{assignInfo.count}</Badge>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">Subscription</div>
                          {balance === null ? (
                            <Badge variant="outline">No Wallet</Badge>
                          ) : subActive ? (
                            <Badge className="bg-green-600 text-white">Active</Badge>
                          ) : (
                            <Badge className="bg-amber-500 text-white">Inactive</Badge>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setSelectedProfileId(p.id);
                              setDialogOpen(true);
                            }}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            Assign
                          </Button>
                          {assignInfo.count > 0 ? (
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                const first = vehicles.find(v => v.assignedTo?.profile_id === p.id);
                                if (first) setSelectedVehicleId(first.device_id);
                              }}
                            >
                              View
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                }}
              />
            )}
          </CardContent>
        </Card>

        <AssignmentManagerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialTab="edit-user"
          editProfile={
            selectedProfile
              ? {
                  id: selectedProfile.id,
                  name: selectedProfile.name,
                  email: selectedProfile.email,
                  phone: selectedProfile.phone,
                  user_id: selectedProfile.user_id,
                  assignmentCount: selectedProfileVehicles.length,
                }
              : null
          }
          selectedVehicles={selectedProfileVehicles}
        />

        <CreateTestUserDialog open={createUserOpen} onOpenChange={setCreateUserOpen} />

        <Dialog open={importedOpen} onOpenChange={setImportedOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Imported Vehicles</DialogTitle>
              <DialogDescription>Details from the latest GPS51 sync</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 mb-3">
              <Input
                placeholder="Search by name, device ID, SIM, owner..."
                value={importedSearch}
                onChange={(e) => setImportedSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Device ID</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importedVehicles
                    .filter(v => {
                      const q = importedSearch.toLowerCase();
                      if (!q) return true;
                      return (
                        (v.device_name || "").toLowerCase().includes(q) ||
                        (v.device_id || "").toLowerCase().includes(q) ||
                        (v.sim_number || "").toLowerCase().includes(q) ||
                        (v.device_type || "").toLowerCase().includes(q) ||
                        (v.group_name || "").toLowerCase().includes(q) ||
                        (v.gps_owner || "").toLowerCase().includes(q)
                      );
                    })
                    .map(v => (
                      <TableRow key={v.device_id}>
                        <TableCell className="font-medium">{v.device_name}</TableCell>
                        <TableCell className="text-xs">{v.device_id}</TableCell>
                        <TableCell className="text-xs">{v.sim_number || "—"}</TableCell>
                        <TableCell className="text-xs">{v.device_type || "—"}</TableCell>
                        <TableCell className="text-xs">{v.group_name || "—"}</TableCell>
                        <TableCell className="text-xs">{v.gps_owner || "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedVehicleId} onOpenChange={(open) => !open && setSelectedVehicleId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Vehicle Profile</DialogTitle>
              <DialogDescription>Admin view of vehicle details</DialogDescription>
            </DialogHeader>
            {selectedVehicle ? (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Name:</span> {selectedVehicle.device_name}</div>
                <div><span className="font-medium">Device ID:</span> {selectedVehicle.device_id}</div>
                <div><span className="font-medium">SIM:</span> {selectedVehicle.sim_number || "—"}</div>
                <div><span className="font-medium">Type:</span> {selectedVehicle.device_type || "—"}</div>
                <div><span className="font-medium">Group:</span> {selectedVehicle.group_name || "—"}</div>
                <div><span className="font-medium">GPS Owner:</span> {selectedVehicle.gps_owner || "—"}</div>
                <div><span className="font-medium">Last Synced:</span> {selectedVehicle.last_synced_at || "—"}</div>
                {selectedVehicle.assignedTo ? (
                  <div><span className="font-medium">Assigned To:</span> {selectedVehicle.assignedTo.profile_name}</div>
                ) : (
                  <div><span className="font-medium">Assigned To:</span> Unassigned</div>
                )}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
