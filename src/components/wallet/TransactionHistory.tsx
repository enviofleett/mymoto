import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  reference: string | null;
  created_at: string;
}

interface TransactionHistoryProps {
  transactions: Transaction[];
  loading?: boolean;
}

export function TransactionHistory({
  transactions,
  loading,
}: TransactionHistoryProps) {
  if (loading) {
    return (
      <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <History className="h-4 w-4 text-foreground" />
            </div>
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <History className="h-4 w-4 text-foreground" />
            </div>
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 rounded-xl shadow-neumorphic-inset bg-card">
            <p className="text-foreground font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Top up your wallet to get started
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
            <History className="h-4 w-4 text-foreground" />
          </div>
          Transaction History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile View - Neumorphic cards */}
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 p-3 rounded-xl shadow-neumorphic-sm bg-card transition-all duration-200 hover:shadow-neumorphic"
            >
              {/* Icon with neumorphic container */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center shrink-0",
                  tx.type === "credit"
                    ? "ring-2 ring-status-active/30"
                    : "ring-2 ring-destructive/30"
                )}
              >
                {tx.type === "credit" ? (
                  <ArrowDownLeft className="h-4 w-4 text-status-active" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-destructive" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}
                </p>
              </div>
              
              <span
                className={cn(
                  "font-semibold text-sm",
                  tx.type === "credit" ? "text-status-active" : "text-destructive"
                )}
              >
                {tx.type === "credit" ? "+" : "-"}₦
                {Math.abs(tx.amount).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
