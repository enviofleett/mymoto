import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { WalletSection } from "@/components/wallet/WalletSection";
import myMotoLogo from "@/assets/mymoto-logo-new.png";

export default function OwnerWallet() {
  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header - Neumorphic styling */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-4 safe-area-inset-top">
          <div className="flex items-center gap-2.5">
            <img alt="MyMoto" className="w-6 h-6 object-contain" src={myMotoLogo} />
            <div>
              <h1 className="text-xl font-bold text-foreground">Wallet</h1>
              <p className="text-sm text-muted-foreground">Manage your balance and payments</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 pb-32 pt-4">
          <WalletSection />
        </div>
      </div>
    </OwnerLayout>
  );
}
