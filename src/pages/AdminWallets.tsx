import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminWallets } from "@/hooks/useAdminWallets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingUp, ArrowUpDown, Settings, Plus, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";

export default function AdminWallets() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { wallets, loading, stats, newUserBonus, updateNewUserBonus, adjustWallet, auditLogs, refetch } = useAdminWallets();
  
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "on_leave">("all");
  const [sortKey, setSortKey] = useState<"balance" | "created_at" | "last_activity_at">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleAdjust = async () => {
    if (!selectedWallet || !adjustAmount) return;
    
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount <= 0) return;

    const success = await adjustWallet(selectedWallet, amount, adjustType, adjustDescription, true, captchaToken || undefined);
    if (success) {
      setAdjustDialogOpen(false);
      setAdjustAmount("");
      setAdjustDescription("");
      setCaptchaToken("");
      setSelectedWallet(null);
    }
  };

  const handleUpdateBonus = async () => {
    const amount = parseFloat(bonusAmount);
    if (isNaN(amount) || amount < 0) return;

    const success = await updateNewUserBonus(amount);
    if (success) {
      setBonusDialogOpen(false);
      setBonusAmount("");
      refetch();
    }
  };

  const openAdjustDialog = (walletId: string, type: "credit" | "debit") => {
    setSelectedWallet(walletId);
    setAdjustType(type);
    setAdjustDialogOpen(true);
  };

  const visibleWallets = wallets
    .filter(w => {
      const matchesSearch =
        !search ||
        (w.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (w.name || "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || (w.status || "active") === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const av = a[sortKey] || "";
      const bv = b[sortKey] || "";
      if (sortKey === "balance") {
        return sortDir === "asc" ? (a.balance - b.balance) : (b.balance - a.balance);
      }
      const at = new Date(String(av)).getTime();
      const bt = new Date(String(bv)).getTime();
      return sortDir === "asc" ? (at - bt) : (bt - at);
    });

  const displayedWallets = visibleWallets.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Wallet Management</h1>
            <p className="text-muted-foreground">View and manage user wallets</p>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <Input
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Dialog open={bonusDialogOpen} onOpenChange={setBonusDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                New User Bonus: ₦{newUserBonus.toLocaleString()}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set New User Bonus</DialogTitle>
              <DialogDescription>
                This amount will be automatically credited to new user wallets upon registration. 
                New users will receive an email notification when their welcome bonus is applied.
              </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Bonus Amount (NGN)</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 1000"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBonusDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateBonus}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Revenue Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{stats.totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">From billing debits</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
              <Plus className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{stats.totalCredits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All wallet top-ups</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
              <Minus className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦{stats.totalDebits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All wallet debits</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.transactionCount}</div>
              <p className="text-xs text-muted-foreground">Total transactions</p>
            </CardContent>
          </Card>
        </div>

        {/* Wallets Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              All User Wallets
            </CardTitle>
            <CardDescription>
              View balances and manually adjust user wallets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label>Sort by</Label>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as any)}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balance">Balance</SelectItem>
                    <SelectItem value="created_at">Registration</SelectItem>
                    <SelectItem value="last_activity_at">Last Activity</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v) => setSortDir(v as any)}>
                  <SelectTrigger className="w-full sm:w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Asc</SelectItem>
                    <SelectItem value="desc">Desc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <BulkUploadTopUp onComplete={() => refetch()} />
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">Loading wallets...</p>
              </div>
            ) : (
              <ResponsiveDataList
                items={displayedWallets}
                empty={<div className="text-center text-muted-foreground py-6">No wallets found</div>}
                desktop={
                  <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Balance</TableHead>
                          <TableHead>Registered</TableHead>
                          <TableHead>Last Activity</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayedWallets.map((wallet) => (
                          <TableRow key={wallet.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{wallet.name || wallet.email || "No name"}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {wallet.user_id}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={wallet.status === "inactive" ? "destructive" : "default"}>
                                {wallet.status || "active"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={wallet.balance < 0 ? "text-destructive" : "text-foreground"}>
                                ₦{wallet.balance.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              {new Date(wallet.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {wallet.last_activity_at ? new Date(wallet.last_activity_at).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => openAdjustDialog(wallet.id, "credit")}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Credit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => openAdjustDialog(wallet.id, "debit")}
                                >
                                  <Minus className="h-4 w-4 mr-1" />
                                  Debit
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                }
                renderCard={(wallet) => (
                  <Card key={wallet.id} className="bg-card border-border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{wallet.name || wallet.email || "No name"}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">{wallet.user_id}</div>
                        </div>
                        <Badge variant={wallet.status === "inactive" ? "destructive" : "default"}>
                          {wallet.status || "active"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">Balance</div>
                        <div className={wallet.balance < 0 ? "text-destructive font-semibold" : "text-foreground font-semibold"}>
                          ₦{wallet.balance.toLocaleString()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-muted-foreground">Registered</div>
                        <div className="text-right">{new Date(wallet.created_at).toLocaleDateString()}</div>
                        <div className="text-muted-foreground">Last Activity</div>
                        <div className="text-right">{wallet.last_activity_at ? new Date(wallet.last_activity_at).toLocaleDateString() : "—"}</div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-green-600 hover:text-green-700"
                          onClick={() => openAdjustDialog(wallet.id, "credit")}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Credit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700"
                          onClick={() => openAdjustDialog(wallet.id, "debit")}
                        >
                          <Minus className="h-4 w-4 mr-2" />
                          Debit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            )}
            <div className="flex justify-end items-center gap-2 mt-3">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Billing Config Audit
            </CardTitle>
            <CardDescription>
              Recent changes to billing settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveDataList
              items={auditLogs}
              empty={<div className="text-center text-muted-foreground py-6">No audit entries</div>}
              desktop={
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Old</TableHead>
                        <TableHead>New</TableHead>
                        <TableHead>Updated By</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{log.key}</TableCell>
                          <TableCell>{log.old_value !== null ? `₦${log.old_value.toLocaleString()}` : "—"}</TableCell>
                          <TableCell>{log.new_value !== null ? `₦${log.new_value.toLocaleString()}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">{log.updated_by_email || "—"}</span>
                              <span className="text-xs text-muted-foreground">{log.updated_by || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <span className="line-clamp-2">{log.reason || "—"}</span>
                          </TableCell>
                          <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              }
              renderCard={(log) => (
                <Card key={log.id} className="bg-card border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{log.key}</div>
                        <div className="text-xs text-muted-foreground truncate">{log.updated_by_email || "—"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {new Date(log.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-muted-foreground">Old</div>
                      <div className="text-right">{log.old_value !== null ? `₦${log.old_value.toLocaleString()}` : "—"}</div>
                      <div className="text-muted-foreground">New</div>
                      <div className="text-right">{log.new_value !== null ? `₦${log.new_value.toLocaleString()}` : "—"}</div>
                      <div className="text-muted-foreground">Reason</div>
                      <div className="text-right truncate">{log.reason || "—"}</div>
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          </CardContent>
        </Card>

        {/* Adjust Dialog */}
        <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {adjustType === "credit" ? "Credit Wallet" : "Debit Wallet"}
              </DialogTitle>
              <DialogDescription>
                {adjustType === "credit" 
                  ? "Add funds to this user's wallet" 
                  : "Remove funds from this user's wallet"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount (NGN)</Label>
                <Input
                  type="number"
                  placeholder="e.g., 5000"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="e.g., Bonus credit"
                  value={adjustDescription}
                  onChange={(e) => setAdjustDescription(e.target.value)}
                />
              </div>
              {adjustType === "credit" && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm text-muted-foreground">
                    💡 An email notification will be sent to the user when their wallet is credited.
                  </p>
                </div>
              )}
              {adjustType === "credit" && (
                <div className="space-y-2">
                  <Label>CAPTCHA token (only for high-value credits)</Label>
                  <Input
                    placeholder="Paste CAPTCHA token if required"
                    value={captchaToken}
                    onChange={(e) => setCaptchaToken(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAdjust}
                variant={adjustType === "credit" ? "default" : "destructive"}
              >
                {adjustType === "credit" ? "Credit" : "Debit"} Wallet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function BulkUploadTopUp({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const { adjustWallet } = useAdminWallets();
  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    for (const row of rows) {
      const [email, amountStr, reason] = row.split(",").map(s => s?.trim());
      const amount = parseFloat(amountStr || "0");
      if (!email || !amount || amount <= 0) continue;
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("id, user_id")
        .eq("email", email)
        .maybeSingle();
      const ownerId = (profile as any)?.id ?? (profile as any)?.user_id ?? null;
      if (!ownerId) continue;
      const { data: wallet } = await (supabase as any)
        .from("wallets")
        .select("id")
        .eq("user_id", ownerId)
        .maybeSingle();
      let walletId = (wallet as any)?.id ?? null;
      // Fallback for environments where wallets.profile_id is used instead of wallets.user_id.
      if (!walletId) {
        const tryProfileId = await (supabase as any)
          .from("wallets")
          .select("id")
          .eq("profile_id", ownerId)
          .maybeSingle();
        walletId = (tryProfileId as any)?.data?.id ?? null;
      }
      if (walletId) {
        await adjustWallet(walletId, amount, "credit", reason || "Bulk upload");
      }
    }
    setLoading(false);
    onComplete();
  };
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm">Bulk upload</Label>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {loading && <span className="text-sm text-muted-foreground">Processing {fileName}...</span>}
    </div>
  );
}
