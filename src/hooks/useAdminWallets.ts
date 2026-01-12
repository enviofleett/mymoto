import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserWallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  email: string | null;
  created_at: string;
}

interface RevenueStats {
  totalRevenue: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
}

export function useAdminWallets() {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RevenueStats>({
    totalRevenue: 0,
    totalCredits: 0,
    totalDebits: 0,
    transactionCount: 0,
  });
  const [newUserBonus, setNewUserBonus] = useState(0);

  useEffect(() => {
    fetchWallets();
    fetchStats();
    fetchNewUserBonus();
  }, []);

  const fetchWallets = async () => {
    setLoading(true);
    
    // Fetch wallets with user emails from profiles
    const { data: walletsData, error: walletsError } = await (supabase
      .from("wallets" as any)
      .select("id, user_id, balance, currency, created_at") as any);

    if (walletsError) {
      console.error("Error fetching wallets:", walletsError);
      setLoading(false);
      return;
    }

    const walletsArr = (walletsData || []) as any[];

    // Get user emails from user_roles (we can't access auth.users directly)
    // For now, we'll show user_id and try to get emails from profiles if available
    const userIds = walletsArr.map((w: any) => w.user_id);
    
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, email")
      .in("user_id", userIds);

    const profileMap = new Map((profilesData || []).map((p: any) => [p.user_id, p.email]));

    const enrichedWallets: UserWallet[] = walletsArr.map((w: any) => ({
      id: w.id,
      user_id: w.user_id,
      balance: parseFloat(String(w.balance)) || 0,
      currency: w.currency || "NGN",
      email: profileMap.get(w.user_id) || null,
      created_at: w.created_at,
    }));

    setWallets(enrichedWallets);
    setLoading(false);
  };

  const fetchStats = async () => {
    const { data, error } = await (supabase
      .from("wallet_transactions" as any)
      .select("amount, type") as any);

    if (error) {
      console.error("Error fetching stats:", error);
      return;
    }

    const txData = (data || []) as any[];
    const credits = txData.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + parseFloat(String(t.amount)), 0);
    const debits = txData.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + parseFloat(String(t.amount)), 0);

    setStats({
      totalRevenue: debits,
      totalCredits: credits,
      totalDebits: debits,
      transactionCount: txData.length,
    });
  };

  const fetchNewUserBonus = async () => {
    const { data } = await (supabase
      .from("billing_config" as any)
      .select("value")
      .eq("key", "new_user_bonus")
      .single() as any);

    if (data) {
      setNewUserBonus(parseFloat(String(data.value)) || 0);
    }
  };

  const updateNewUserBonus = async (amount: number) => {
    const { error } = await (supabase
      .from("billing_config" as any)
      .update({ value: amount, updated_at: new Date().toISOString() })
      .eq("key", "new_user_bonus") as any);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update new user bonus",
        variant: "destructive",
      });
      return false;
    }

    setNewUserBonus(amount);
    toast({
      title: "Success",
      description: `New user bonus updated to ₦${amount.toLocaleString()}`,
    });
    return true;
  };

  const adjustWallet = async (walletId: string, amount: number, type: "credit" | "debit", description: string) => {
    // First, get current balance
    const { data: wallet, error: fetchError } = await (supabase
      .from("wallets" as any)
      .select("balance")
      .eq("id", walletId)
      .single() as any);

    if (fetchError || !wallet) {
      toast({
        title: "Error",
        description: "Failed to fetch wallet",
        variant: "destructive",
      });
      return false;
    }

    const currentBalance = parseFloat(String(wallet.balance)) || 0;
    const newBalance = type === "credit" 
      ? currentBalance + amount 
      : currentBalance - amount;

    if (newBalance < 0) {
      toast({
        title: "Error",
        description: "Insufficient balance for debit",
        variant: "destructive",
      });
      return false;
    }

    // Update wallet balance
    const { error: updateError } = await (supabase
      .from("wallets" as any)
      .update({ balance: newBalance })
      .eq("id", walletId) as any);

    if (updateError) {
      toast({
        title: "Error",
        description: "Failed to update wallet",
        variant: "destructive",
      });
      return false;
    }

    // Create transaction record
    const { error: txError } = await (supabase
      .from("wallet_transactions" as any)
      .insert({
        wallet_id: walletId,
        amount,
        type,
        description: description || `Admin ${type}`,
      }) as any);

    if (txError) {
      console.error("Transaction record error:", txError);
    }

    toast({
      title: "Success",
      description: `Wallet ${type === "credit" ? "credited" : "debited"} ₦${amount.toLocaleString()}`,
    });

    fetchWallets();
    fetchStats();
    return true;
  };

  return {
    wallets,
    loading,
    stats,
    newUserBonus,
    updateNewUserBonus,
    adjustWallet,
    refetch: () => {
      fetchWallets();
      fetchStats();
    },
  };
}
