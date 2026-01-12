import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Car, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalAlertListener } from "@/components/notifications/GlobalAlertListener";
import { StickyAlertBanner } from "@/components/notifications/StickyAlertBanner";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
interface OwnerLayoutProps {
  children: ReactNode;
}
const navItems = [{
  icon: MessageCircle,
  path: "/owner"
}, {
  icon: Car,
  path: "/owner/vehicles"
}, {
  icon: Wallet,
  path: "/owner/wallet"
}, {
  icon: User,
  path: "/owner/profile"
}];
export function OwnerLayout({
  children
}: OwnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => {
    if (path === "/owner") {
      return location.pathname === "/owner" || location.pathname.startsWith("/owner/chat");
    }
    return location.pathname.startsWith(path);
  };
  return <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Global Alert Listener - Real-time notifications */}
      <GlobalAlertListener />
      
      {/* Sticky Alert Banner - Shows at top header */}
      <StickyAlertBanner />

      {/* Top Header with Logo */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border/30 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          {/* Logo on the left */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <img alt="MyMoto" className="w-7 h-7 object-contain" src={myMotoLogo} />
            </div>
            <span className="text-sm font-semibold text-foreground">mymoto</span>
          </div>
          
          {/* Spacer for future notification bell */}
          <div className="w-8" />
        </div>
      </header>
      
      {/* Main Content - scrollable area above fixed nav */}
      <main className="flex-1 overflow-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Bottom Navigation - Premium Neumorphic Icon-Only Design */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/30 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-20 max-w-lg mx-auto px-4">
          {navItems.map(item => {
          const active = isActive(item.path);
          return <button key={item.path} onClick={() => navigate(item.path)} className="flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95">
                {/* Neumorphic icon container */}
                <div className={cn("flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300", active ? "shadow-neumorphic-inset ring-2 ring-accent/70 bg-card" : "shadow-neumorphic-sm bg-card hover:shadow-neumorphic")}>
                  <item.icon className={cn("h-5 w-5 transition-colors duration-200", active ? "text-accent" : "text-muted-foreground")} />
                </div>
                {/* Active indicator dot */}
                <div className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300", active ? "bg-accent scale-100" : "bg-transparent scale-0")} />
              </button>;
        })}
        </div>
      </nav>
    </div>;
}