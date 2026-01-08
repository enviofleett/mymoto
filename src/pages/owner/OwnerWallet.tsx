import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { WalletSection } from "@/components/wallet/WalletSection";

export default function OwnerWallet() {
  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background px-4 py-4 safe-area-inset-top border-b border-border">
          <h1 className="text-xl font-bold text-foreground">Wallet</h1>
          <p className="text-sm text-muted-foreground">Manage your balance and payments</p>
        </div>

        {/* Content */}
        <div className="flex-1 p-4">
          <WalletSection />
        </div>
      </div>
    </OwnerLayout>
  );
}
