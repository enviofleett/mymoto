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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingUp, TrendingDown, ArrowUpDown, Settings, Plus, Minus } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function AdminWallets() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { wallets, loading, stats, newUserBonus, updateNewUserBonus, adjustWallet } = useAdminWallets();
  
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusDialogOpen, setBonusDialogOpen] = useState(false);

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

    const success = await adjustWallet(selectedWallet, amount, adjustType, adjustDescription);
    if (success) {
      setAdjustDialogOpen(false);
      setAdjustAmount("");
      setAdjustDescription("");
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
    }
  };

  const openAdjustDialog = (walletId: string, type: "credit" | "debit") => {
    setSelectedWallet(walletId);
    setAdjustType(type);
    setAdjustDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Wallet Management</h1>
            <p className="text-muted-foreground">View and manage user wallets</p>
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
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">Loading wallets...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{wallet.email || "No email"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {wallet.user_id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={wallet.balance < 0 ? "text-destructive" : "text-foreground"}>
                          ₦{wallet.balance.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(wallet.created_at).toLocaleDateString()}
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
                  {wallets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No wallets found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
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
