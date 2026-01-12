import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  reference: string | null;
  created_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topUpLoading, setTopUpLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWallet();
      fetchTransactions();
    }
  }, [user]);

  const fetchWallet = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("wallets")
      .select("id, balance, currency")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error("Error fetching wallet:", error);
      // Wallet might not exist yet, create one
      if (error.code === "PGRST116") {
        const { data: newWallet, error: createError } = await supabase
          .from("wallets")
          .insert({ user_id: user.id })
          .select()
          .single();

      if (!createError && newWallet) {
          setWallet({
            id: newWallet.id,
            balance: parseFloat(String(newWallet.balance)) || 0,
            currency: newWallet.currency || "NGN",
          });
        }
      }
    } else if (data) {
      setWallet({
        id: data.id,
        balance: parseFloat(String(data.balance)) || 0,
        currency: data.currency || "NGN",
      });
    }
    setLoading(false);
  };

  const fetchTransactions = async () => {
    if (!user) return;

    const { data: walletData } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!walletData) return;

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, amount, type, description, reference, created_at")
      .eq("wallet_id", walletData.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setTransactions(
        data.map((t) => ({
          ...t,
          amount: parseFloat(String(t.amount)),
          type: t.type as "credit" | "debit",
        }))
      );
    }
  };

  const initiateTopUp = async (amount: number) => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "Please log in to top up your wallet",
        variant: "destructive",
      });
      return;
    }

    setTopUpLoading(true);

    try {
      const response = await supabase.functions.invoke("paystack", {
        body: {
          email: user.email,
          amount,
          user_id: user.id,
          callback_url: window.location.origin + "/profile?tab=wallet",
        },
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.error) throw response.error;

      const data = response.data;

      if (data.success && data.authorization_url) {
        // Redirect to Paystack checkout
        window.location.href = data.authorization_url;
      } else {
        throw new Error(data.error || "Failed to initialize payment");
      }
    } catch (error: any) {
      console.error("Top-up error:", error);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment",
        variant: "destructive",
      });
    } finally {
      setTopUpLoading(false);
    }
  };

  const verifyPayment = async (reference: string) => {
    try {
      const response = await supabase.functions.invoke("paystack", {
        body: { reference },
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.data?.success) {
        toast({
          title: "Payment Successful",
          description: `NGN ${response.data.amount.toLocaleString()} has been added to your wallet`,
        });
        fetchWallet();
        fetchTransactions();
        return true;
      }
    } catch (error) {
      console.error("Verification error:", error);
    }
    return false;
  };

  return {
    wallet,
    transactions,
    loading,
    topUpLoading,
    initiateTopUp,
    verifyPayment,
    refetch: () => {
      fetchWallet();
      fetchTransactions();
    },
  };
}
