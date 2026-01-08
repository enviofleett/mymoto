import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000];

interface TopUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopUp: (amount: number) => void;
  loading?: boolean;
  dailyRate?: number;
}

export function TopUpDialog({
  open,
  onOpenChange,
  onTopUp,
  loading,
  dailyRate = 500,
}: TopUpDialogProps) {
  const [amount, setAmount] = useState<number>(5000);
  const [customAmount, setCustomAmount] = useState("");

  const handleQuickAmount = (value: number) => {
    setAmount(value);
    setCustomAmount("");
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleSubmit = () => {
    if (amount >= 100) {
      onTopUp(amount);
    }
  };

  const daysOfService = Math.floor(amount / dailyRate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Top Up Wallet</DialogTitle>
          <DialogDescription>
            Add funds to your wallet using Paystack. Current rate: ₦
            {dailyRate}/day per vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              Quick Select
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((value) => (
                <Button
                  key={value}
                  variant={amount === value && !customAmount ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleQuickAmount(value)}
                >
                  ₦{value.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-amount">Or enter custom amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₦
              </span>
              <Input
                id="custom-amount"
                type="number"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="pl-8"
                min={100}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount to pay</span>
              <span className="font-medium">₦{amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Service days (1 vehicle)
              </span>
              <span className="font-medium text-primary">
                {daysOfService} days
              </span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || amount < 100}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>Pay ₦{amount.toLocaleString()} with Paystack</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secured by Paystack. You'll be redirected to complete payment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
