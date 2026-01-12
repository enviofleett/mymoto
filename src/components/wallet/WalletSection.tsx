import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { WalletCard } from "./WalletCard";
import { TopUpDialog } from "./TopUpDialog";
import { TransactionHistory } from "./TransactionHistory";
import { supabase } from "@/integrations/supabase/client";

export function WalletSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    wallet,
    transactions,
    loading,
    topUpLoading,
    initiateTopUp,
    verifyPayment,
    refetch,
  } = useWallet();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [dailyRate, setDailyRate] = useState(500);

  // Fetch daily rate
  useEffect(() => {
    const fetchRate = async () => {
      const { data } = await (supabase
        .from("billing_config" as any)
        .select("value")
        .eq("key", "daily_llm_rate")
        .single() as any);

      if (data) {
        setDailyRate(parseFloat(String((data as any).value)));
      }
    };
    fetchRate();
  }, []);

  // Handle Paystack callback
  useEffect(() => {
    const reference = searchParams.get("reference");
    const trxref = searchParams.get("trxref");
    const ref = reference || trxref;

    if (ref) {
      verifyPayment(ref).then(() => {
        // Clear the URL params
        searchParams.delete("reference");
        searchParams.delete("trxref");
        setSearchParams(searchParams);
      });
    }
  }, [searchParams]);

  const handleTopUp = (amount: number) => {
    initiateTopUp(amount);
    setTopUpOpen(false);
  };

  return (
    <div className="space-y-6">
      <WalletCard
        balance={wallet?.balance || 0}
        currency={wallet?.currency || "NGN"}
        loading={loading}
        onTopUp={() => setTopUpOpen(true)}
        onRefresh={refetch}
      />

      <TransactionHistory transactions={transactions} loading={loading} />

      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        onTopUp={handleTopUp}
        loading={topUpLoading}
        dailyRate={dailyRate}
      />
    </div>
  );
}
