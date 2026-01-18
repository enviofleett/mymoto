import { NavLink } from "@/components/NavLink";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Truck, 
  Map, 
  Brain, 
  Menu,
  X,
  Settings,
  LogOut,
  Wallet,
  BellRing
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const mainNavItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Fleet", url: "/fleet", icon: Truck },
  { title: "Map", url: "/map", icon: Map },
  { title: "Insights", url: "/insights", icon: Brain },
];

const menuItems = [
  { title: "Notifications", url: "/notifications", icon: BellRing },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin Wallets", url: "/admin/wallets", icon: Wallet, adminOnly: true },
];

export function BottomNavigation() {
  const { signOut, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      await signOut();
      // Use window.location for a hard redirect (more reliable for logout)
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout error:", error);
      // Still redirect even if signOut fails
      window.location.href = "/auth";
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 text-muted-foreground transition-colors min-w-[64px]"
            activeClassName="text-primary"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.title}</span>
          </NavLink>
        ))}

        {/* Menu Button */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-1 px-3 py-2 text-muted-foreground transition-colors min-w-[64px]">
              <Menu className="h-5 w-5" />
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-xl">
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Truck className="h-4 w-4 text-primary-foreground" />
                </div>
                FleetHub Menu
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-2">
              {menuItems.map((item) => {
                if (item.adminOnly && !isAdmin) return null;
                return (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground transition-colors hover:bg-muted"
                    activeClassName="bg-primary/10 text-primary"
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.title}</span>
                  </NavLink>
                );
              })}
              <div className="border-t border-border pt-4 mt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Logout</span>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
