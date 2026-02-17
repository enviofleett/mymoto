import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Car, Wallet, User, Store, LayoutDashboard, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalAlertListener } from "@/components/notifications/GlobalAlertListener";
import { StickyAlertBanner } from "@/components/notifications/StickyAlertBanner";
import { useOwnerFooterPadding } from "@/hooks/useFooterPadding";
import { useAuth } from "@/contexts/AuthContext";

interface OwnerLayoutProps {
  children: ReactNode;
}

const ownerNavItems = [{
  icon: Car,
  path: "/owner/vehicles",
  label: "Vehicles"
}, {
  icon: MessageCircle,
  path: "/owner",
  label: "Chat"
}, {
  icon: Store,
  path: "/owner/directory",
  label: "Directory"
}, {
  icon: Wallet,
  path: "/owner/wallet",
  label: "Wallet"
}, {
  icon: User,
  path: "/owner/profile",
  label: "Profile"
}];

const partnerNavItems = [{
  icon: LayoutDashboard,
  path: "/partner/dashboard",
  label: "Home"
}, {
  icon: Edit,
  path: "/partner/profile",
  label: "Profile"
}];

export function OwnerLayout({
  children
}: OwnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const footerPadding = useOwnerFooterPadding();
  const { isProvider } = useAuth();
  
  // Use different nav items based on role
  const baseNavItems = isProvider ? partnerNavItems : ownerNavItems;
  const navItems = baseNavItems;
  
  const isActive = (path: string) => {
    if (isProvider) {
      // Partner navigation
      if (path === "/partner/dashboard") {
        return location.pathname === "/partner/dashboard";
      }
      if (path === "/partner/profile") {
        return location.pathname === "/partner/profile";
      }
    } else {
      // Owner navigation
      if (path === "/owner") {
        return location.pathname === "/owner" || location.pathname.startsWith("/owner/chat");
      }
      if (path === "/owner/directory") {
        return location.pathname === "/owner/directory";
      }
    }
    return location.pathname.startsWith(path);
  };
  
  return (
    <div className="h-[var(--app-height)] min-h-0 bg-background flex flex-col overflow-hidden">
      {/* Global Alert Listener - Real-time notifications */}
      <GlobalAlertListener />
      
      {/* Sticky Alert Banner - Shows at top header */}
      <StickyAlertBanner />
      
      {/* Main Content - Dynamic padding ensures content is never cut off by footer */}
      {/* CRITICAL FIX: overflow-x-hidden prevents horizontal scroll, pb-32 ensures content clears footer */}
      {/* ADDED: pt-[calc(env(safe-area-inset-top)+1rem)] prevents top notch cutoff */}
      <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain app-scroll px-fluid pb-4 md:pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] ${footerPadding}`}>
        <div className="mx-auto max-w-7xl w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

      {/* Bottom Navigation - Premium Neumorphic Icon-Only Design */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/30 pb-[env(safe-area-inset-bottom)]"
        style={{ bottom: "var(--keyboard-inset, 0px)" }}
      >
        <div className="flex items-center justify-around h-20 max-[360px]:h-16 max-w-lg mx-auto px-4 max-[360px]:px-2">
          {navItems.map(item => {
          const active = isActive(item.path);
          return <button key={item.path} onClick={() => navigate(item.path)} className="flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 min-w-[56px]">
                {/* Neumorphic icon container */}
                <div className={cn("flex items-center justify-center w-12 h-12 max-[360px]:w-10 max-[360px]:h-10 rounded-full transition-all duration-300", active ? "shadow-neumorphic-inset ring-2 ring-accent/70 bg-card" : "shadow-neumorphic-sm bg-card hover:shadow-neumorphic")}>
                  <item.icon className={cn("h-5 w-5 transition-colors duration-200", active ? "text-accent" : "text-muted-foreground")} />
                </div>
                <span className={cn("text-[10px] leading-none transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
                  {item.label}
                </span>
                {/* Active indicator dot */}
                <div className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300", active ? "bg-accent scale-100" : "bg-transparent scale-0")} />
              </button>;
          })}
        </div>
      </nav>
    </div>
  );
}
