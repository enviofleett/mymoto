import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Car, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnerLayoutProps {
  children: ReactNode;
}

const navItems = [
  { icon: MessageCircle, label: "Chat", path: "/owner" },
  { icon: Car, label: "Vehicles", path: "/owner/vehicles" },
  { icon: Wallet, label: "Wallet", path: "/owner/wallet" },
  { icon: User, label: "Profile", path: "/owner/profile" },
];

export function OwnerLayout({ children }: OwnerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/owner") {
      return location.pathname === "/owner" || location.pathname.startsWith("/owner/chat");
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Main Content - scrollable area above fixed nav */}
      <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Bottom Navigation - Fixed */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all duration-200 active:scale-95",
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200",
                  active && "bg-primary/15"
                )}>
                  <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  active && "text-primary"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
