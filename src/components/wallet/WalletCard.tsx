import { Wallet, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WalletCardProps {
  balance: number;
  currency: string;
  loading?: boolean;
  onTopUp: () => void;
  onRefresh: () => void;
}

export function WalletCard({
  balance,
  currency,
  loading,
  onTopUp,
  onRefresh,
}: WalletCardProps) {
  const isLow = balance < 1000;
  const isNegative = balance < 0;

  if (loading) {
    return (
      <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-40 mb-4" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-card shadow-neumorphic rounded-2xl overflow-hidden">
      {/* Gradient accent bar */}
      <div className={cn(
        "h-1",
        isNegative 
          ? "bg-gradient-to-r from-destructive to-destructive/50"
          : isLow
          ? "bg-gradient-to-r from-accent to-accent/50"
          : "bg-gradient-to-r from-status-active to-status-active/50"
      )} />
      
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Wallet className="h-4 w-4 text-foreground" />
            </div>
            <span>Wallet Balance</span>
          </span>
          <button
            onClick={onRefresh}
            className="w-9 h-9 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="pb-5">
        {/* Balance display - Neumorphic inset */}
        <div className="rounded-xl shadow-neumorphic-inset bg-card p-4 mb-4">
          <div className="flex items-baseline gap-2 justify-center">
            <span className="text-2xl font-bold text-muted-foreground">
              {currency === "NGN" ? "₦" : currency}
            </span>
            <span
              className={cn(
                "text-4xl font-bold",
                isNegative ? "text-destructive" : "text-foreground"
              )}
            >
              {balance.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {isNegative && (
          <div className="flex items-center gap-2 text-sm text-destructive mb-3 p-3 rounded-lg shadow-neumorphic-inset bg-card">
            <TrendingDown className="h-4 w-4" />
            <span>Your balance is negative. LLM features are disabled.</span>
          </div>
        )}

        {isLow && !isNegative && (
          <div className="flex items-center gap-2 text-sm text-accent mb-3 p-3 rounded-lg shadow-neumorphic-inset bg-card">
            <TrendingDown className="h-4 w-4" />
            <span>Low balance warning. Top up soon!</span>
          </div>
        )}

        {/* Top up button - Neumorphic with accent ring */}
        <button 
          onClick={onTopUp} 
          className={cn(
            "w-full h-12 rounded-xl shadow-neumorphic-sm bg-card font-medium transition-all duration-200",
            "hover:shadow-neumorphic active:shadow-neumorphic-inset",
            "flex items-center justify-center gap-2",
            "ring-2 ring-accent/50 text-accent"
          )}
        >
          <TrendingUp className="h-4 w-4" />
          Top Up Wallet
        </button>
      </CardContent>
    </Card>
  );
}
