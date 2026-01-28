import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, 
  Truck, 
  Map, 
  Brain, 
  Settings, 
  LogOut,
  Wallet,
  Database,
  Bell,
  BellRing,
  Link2,
  Shield,
  BookOpen,
  Building2
} from "lucide-react";
import { ConnectionStatus } from "@/hooks/useFleetData";

interface TopNavigationProps {
  connectionStatus?: ConnectionStatus;
}

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Fleet", url: "/fleet", icon: Truck },
  { title: "Map", url: "/map", icon: Map },
  { title: "Insights", url: "/insights", icon: Brain },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function TopNavigation({ connectionStatus }: TopNavigationProps) {
  const { signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Logout error:", error);
      navigate("/auth");
    }
  };

  const getStatusIndicator = () => {
    switch (connectionStatus) {
      case "connected":
        return (
          <div className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
        );
      case "connecting":
        return (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
            Connecting
          </div>
        );
      case "disconnected":
        return (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            Offline
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 lg:px-6">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Truck className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground hidden sm:inline">FleetHub</span>
        </div>

        {/* Nav Links - Desktop */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
              activeClassName="text-primary bg-primary/10"
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <NavLink
                to="/admin/wallets"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Wallet className="h-4 w-4" />
                <span>Wallets</span>
              </NavLink>
              <NavLink
                to="/admin/storage"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Database className="h-4 w-4" />
                <span>Storage</span>
              </NavLink>
              <NavLink
                to="/admin/alerts"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Bell className="h-4 w-4" />
                <span>Alerts</span>
              </NavLink>
              <NavLink
                to="/admin/ai-settings"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Brain className="h-4 w-4" />
                <span>AI Brain</span>
              </NavLink>
              <NavLink
                to="/admin/assignments"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Link2 className="h-4 w-4" />
                <span>Assign</span>
              </NavLink>
              <NavLink
                to="/admin/privacy-settings"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Shield className="h-4 w-4" />
                <span>Privacy & Terms</span>
              </NavLink>
              <NavLink
                to="/admin/resources"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <BookOpen className="h-4 w-4" />
                <span>Resources</span>
              </NavLink>
              <NavLink
                to="/admin/directory"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="text-primary bg-primary/10"
              >
                <Building2 className="h-4 w-4" />
                <span>Directory</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-4 ml-auto">
          {getStatusIndicator()}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
