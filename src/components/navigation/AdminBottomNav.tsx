import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Truck, 
  Brain, 
  Wallet, 
  Database,
  MoreHorizontal,
  Map,
  BarChart3,
  Settings,
  BellRing,
  Bell,
  Link2,
  Shield,
  Mail,
  LogOut,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ADMIN_NAV_ITEMS = [
  { 
    label: "Command", 
    path: "/", 
    icon: LayoutDashboard,
    activeMatch: /^\/$|^\/admin$/
  },
  { 
    label: "Fleet", 
    path: "/fleet", 
    icon: Truck,
    activeMatch: /^\/fleet/
  },
  { 
    label: "Cortex", 
    path: "/admin/ai-settings", 
    icon: Brain,
    activeMatch: /^\/admin\/(ai-settings|intelligence)/
  },
  { 
    label: "Finance", 
    path: "/admin/wallets", 
    icon: Wallet,
    activeMatch: /^\/admin\/(wallets|finance)/
  },
  { 
    label: "System", 
    path: "/admin/storage", 
    icon: Database,
    activeMatch: /^\/admin\/(storage|alerts|assignments|privacy-settings|directory|system)/
  },
];

const MORE_MENU_ITEMS = [
  { title: "Map", url: "/map", icon: Map },
  { title: "Insights", url: "/insights", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Alerts", url: "/admin/alerts", icon: Bell },
  { title: "Assignments", url: "/admin/assignments", icon: Link2 },
  { title: "Email Templates", url: "/admin/email-templates", icon: Mail },
  { title: "Privacy & Terms", url: "/admin/privacy-settings", icon: Shield },
  { title: "Directory", url: "/admin/directory", icon: Building2 },
];

export function AdminBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      await signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Logout error:", error);
      navigate("/auth");
    }
  };

  // Check if any "More" menu item is active
  const isMoreMenuActive = MORE_MENU_ITEMS.some(item => {
    if (item.url === "/") return location.pathname === "/";
    return location.pathname.startsWith(item.url);
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-20 max-w-lg mx-auto px-4">
        {ADMIN_NAV_ITEMS.map((item) => {
          const isActive = item.activeMatch.test(location.pathname);
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95"
            >
              {/* Neumorphic icon container */}
              <div className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300",
                isActive 
                  ? "shadow-neumorphic-inset ring-2 ring-accent/70 bg-card" 
                  : "shadow-neumorphic-sm bg-card hover:shadow-neumorphic"
              )}>
                <item.icon className={cn(
                  "h-5 w-5 transition-colors duration-200",
                  isActive ? "text-accent" : "text-muted-foreground"
                )} />
              </div>
              {/* Active indicator dot */}
              <div className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                isActive ? "bg-accent scale-100" : "bg-transparent scale-0"
              )} />
              {/* Label */}
              <span className={cn(
                "text-[10px] font-medium transition-colors duration-200",
                isActive ? "text-accent" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More Menu Button */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95">
              {/* Neumorphic icon container */}
              <div className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300",
                isMoreMenuActive
                  ? "shadow-neumorphic-inset ring-2 ring-accent/70 bg-card"
                  : "shadow-neumorphic-sm bg-card hover:shadow-neumorphic"
              )}>
                <MoreHorizontal className={cn(
                  "h-5 w-5 transition-colors duration-200",
                  isMoreMenuActive ? "text-accent" : "text-muted-foreground"
                )} />
              </div>
              {/* Active indicator dot */}
              <div className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                isMoreMenuActive ? "bg-accent scale-100" : "bg-transparent scale-0"
              )} />
              {/* Label */}
              <span className={cn(
                "text-[10px] font-medium transition-colors duration-200",
                isMoreMenuActive ? "text-accent" : "text-muted-foreground"
              )}>
                More
              </span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-xl">
            <SheetHeader className="pb-4">
              <SheetTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <MoreHorizontal className="h-4 w-4 text-primary-foreground" />
                </div>
                More Options
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-2">
              {MORE_MENU_ITEMS.map((item) => {
                const isActive = location.pathname.startsWith(item.url) || 
                  (item.url === "/" && location.pathname === "/");
                
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
