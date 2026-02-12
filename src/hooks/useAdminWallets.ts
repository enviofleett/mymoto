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
    const { data: walletsData, error: walletsError } = await (supabase as any)
      .from("wallets")
      .select("id, user_id, balance, currency, created_at");

    if (walletsError) {
      console.error("Error fetching wallets:", walletsError);
      setLoading(false);
      return;
    }

    // Get user emails from user_roles (we can't access auth.users directly)
    // For now, we'll show user_id and try to get emails from profiles if available
    const userIds = (walletsData as any[])?.map((w: any) => w.user_id) || [];
    
    const { data: profilesData } = await (supabase as any)
      .from("profiles")
      .select("user_id, email")
      .in("user_id", userIds);

    const profileMap = new Map((profilesData as any[])?.map((p: any) => [p.user_id, p.email]) || []);

    const enrichedWallets: UserWallet[] = ((walletsData as any[]) || []).map((w: any) => ({
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
    const { data, error } = await (supabase as any)
      .from("wallet_transactions")
      .select("amount, type");

    if (error) {
      console.error("Error fetching stats:", error);
      return;
    }

    const txData = (data as any[]) || [];
    const credits = txData.filter((t: any) => t.type === "credit").reduce((sum: number, t: any) => sum + parseFloat(String(t.amount)), 0) || 0;
    const debits = txData.filter((t: any) => t.type === "debit").reduce((sum: number, t: any) => sum + parseFloat(String(t.amount)), 0) || 0;

    setStats({
      totalRevenue: debits,
      totalCredits: credits,
      totalDebits: debits,
      transactionCount: txData.length || 0,
    });
  };

  const fetchNewUserBonus = async () => {
    const { data } = await (supabase as any)
      .from("billing_config")
      .select("value")
      .eq("key", "new_user_bonus")
      .single();

    if (data) {
      setNewUserBonus(parseFloat(String((data as any).value)) || 0);
    }
  };

  const updateNewUserBonus = async (amount: number) => {
    try {
      // Get current user first to ensure we're authenticated
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error("[updateNewUserBonus] User check failed:", userError);
        toast({
          title: "Error",
          description: "Please log in to perform this action",
          variant: "destructive",
        });
        return false;
      }

      console.log("[updateNewUserBonus] User authenticated:", user.id, user.email);

      // Get and refresh session to ensure we have a valid token
      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
      let session = initialSession;
      
      // If no session, try refreshing
      if (!session) {
        console.warn("[updateNewUserBonus] No session found, attempting refresh...");
        const { data: refreshData } = await supabase.auth.refreshSession();
        session = refreshData.session;
      }
      
      // Ensure we have a valid access token
      if (!session?.access_token) {
        console.error("[updateNewUserBonus] No access token in session");
        toast({
          title: "Error",
          description: "Authentication token is missing. Please sign in again.",
          variant: "destructive",
        });
        return false;
      }

      console.log("[updateNewUserBonus] Calling admin-update-bonus with amount:", amount);

      const response = await supabase.functions.invoke("admin-update-bonus", {
        body: { amount },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log("[updateNewUserBonus] Response:", { 
        error: response.error, 
        data: response.data 
      });

      if (response.error) {
        // Provide more helpful error messages
        if (response.error.message?.includes("401") || response.error.message?.includes("Unauthorized")) {
          throw new Error("Authentication failed. Please sign in again or check if you have admin access.");
        }
        throw response.error;
      }

      if (response.data?.success) {
        setNewUserBonus(amount);
        toast({
          title: "Success",
          description: `New user bonus updated to ₦${amount.toLocaleString()}`,
        });
        return true;
      } else {
        throw new Error(response.data?.error || "Failed to update new user bonus");
      }
    } catch (error: any) {
      console.error("Update bonus error:", error);
      
      // Provide more specific error messages
      let errorMessage = "Failed to update new user bonus";
      if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        errorMessage = "Authentication failed. Please sign in again.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  };

  const adjustWallet = async (walletId: string, amount: number, type: "credit" | "debit", description: string, sendEmail: boolean = true) => {
    // For credits, use the Edge Function to send email notifications
    if (type === "credit") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({
            title: "Error",
            description: "Please log in to perform this action",
            variant: "destructive",
          });
          return false;
        }

        const response = await supabase.functions.invoke("admin-wallet-topup", {
          body: {
            wallet_id: walletId,
            amount,
            description: description || "Admin top-up",
            send_email: sendEmail,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.error) {
          throw response.error;
        }

        if (response.data?.success) {
          toast({
            title: "Success",
            description: `Wallet credited ₦${amount.toLocaleString()}${response.data.email_sent ? " - Email sent" : ""}`,
          });
          fetchWallets();
          fetchStats();
          return true;
        } else {
          throw new Error(response.data?.error || "Failed to credit wallet");
        }
      } catch (error: any) {
        console.error("Top-up error:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to credit wallet",
          variant: "destructive",
        });
        return false;
      }
    }

    // For debits, use direct database update (no email needed)
    // First, get current balance
    const { data: wallet, error: fetchError } = await (supabase as any)
      .from("wallets")
      .select("balance")
      .eq("id", walletId)
      .single();

    if (fetchError || !wallet) {
      toast({
        title: "Error",
        description: "Failed to fetch wallet",
        variant: "destructive",
      });
      return false;
    }

    const currentBalance = parseFloat(String((wallet as any).balance)) || 0;
    const newBalance = currentBalance - amount;

    if (newBalance < 0) {
      toast({
        title: "Error",
        description: "Insufficient balance for debit",
        variant: "destructive",
      });
      return false;
    }

    // Update wallet balance
    const { error: updateError } = await (supabase as any)
      .from("wallets")
      .update({ balance: newBalance })
      .eq("id", walletId);

    if (updateError) {
      toast({
        title: "Error",
        description: "Failed to update wallet",
        variant: "destructive",
      });
      return false;
    }

    // Create transaction record
    const { error: txError } = await (supabase as any)
      .from("wallet_transactions")
      .insert({
        wallet_id: walletId,
        amount,
        type,
        description: description || `Admin ${type}`,
      });

    if (txError) {
      console.error("Transaction record error:", txError);
    }

    toast({
      title: "Success",
      description: `Wallet debited ₦${amount.toLocaleString()}`,
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
