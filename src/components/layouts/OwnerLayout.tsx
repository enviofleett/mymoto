import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Car, Wallet, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalAlertListener } from "@/components/notifications/GlobalAlertListener";
import { StickyAlertBanner } from "@/components/notifications/StickyAlertBanner";
import { useOwnerFooterPadding } from "@/hooks/useFooterPadding";

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
  icon: Bell,
  path: "/owner/notifications"
}, {
  icon: User,
  path: "/owner/profile"
}];

export function OwnerLayout({
  children
}: OwnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const footerPadding = useOwnerFooterPadding();
  
  const isActive = (path: string) => {
    if (path === "/owner") {
      return location.pathname === "/owner" || location.pathname.startsWith("/owner/chat");
    }
    if (path === "/owner/notifications") {
      return location.pathname === "/owner/notifications";
    }
    return location.pathname.startsWith(path);
  };
  
  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Global Alert Listener - Real-time notifications */}
      <GlobalAlertListener />
      
      {/* Sticky Alert Banner - Shows at top header */}
      <StickyAlertBanner />
      
      {/* Main Content - Dynamic padding ensures content is never cut off by footer */}
      <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${footerPadding}`}>
        <div className="pb-4">
          {children}
        </div>
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
    </div>
  );
}