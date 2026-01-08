import { Wallet, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-40 mb-4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`bg-gradient-to-br border ${
        isNegative
          ? "from-destructive/10 to-destructive/5 border-destructive/20"
          : isLow
          ? "from-yellow-500/10 to-yellow-500/5 border-yellow-500/20"
          : "from-primary/10 to-primary/5 border-primary/20"
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Wallet Balance
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold">
            {currency === "NGN" ? "₦" : currency}
          </span>
          <span
            className={`text-4xl font-bold ${
              isNegative ? "text-destructive" : ""
            }`}
          >
            {balance.toLocaleString("en-NG", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {isNegative && (
          <p className="text-sm text-destructive mb-3 flex items-center gap-1">
            <TrendingDown className="h-4 w-4" />
            Your balance is negative. LLM features are disabled.
          </p>
        )}

        {isLow && !isNegative && (
          <p className="text-sm text-yellow-600 dark:text-yellow-500 mb-3 flex items-center gap-1">
            <TrendingDown className="h-4 w-4" />
            Low balance warning. Top up soon!
          </p>
        )}

        <Button onClick={onTopUp} className="w-full" size="lg">
          <TrendingUp className="mr-2 h-4 w-4" />
          Top Up Wallet
        </Button>
      </CardContent>
    </Card>
  );
}
