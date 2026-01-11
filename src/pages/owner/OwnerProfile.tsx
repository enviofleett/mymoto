import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { SmartBriefingCard } from "@/components/profile/SmartBriefingCard";
import {
  LogOut,
  Mail,
  Car,
  Settings,
  HelpCircle,
  ChevronRight,
  Bell,
  Shield,
  CreditCard,
  User,
  Download,
} from "lucide-react";

export default function OwnerProfile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const [loggingOut, setLoggingOut] = useState(false);

  // Enable real-time updates for owner vehicles
  const deviceIds = vehicles?.map(v => v.deviceId) || [];
  useRealtimeFleetUpdates(deviceIds);

  const primaryVehicleId = vehicles?.[0]?.deviceId;

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
    navigate("/auth");
  };

  const menuItems = [
    { icon: Bell, label: "Notifications", path: "/owner/notifications" },
    { icon: Shield, label: "Privacy & Security", path: "/owner/privacy" },
    { icon: CreditCard, label: "Payment Methods", path: "/owner/payments" },
    { icon: HelpCircle, label: "Help & Support", path: "/owner/help" },
    { icon: Settings, label: "App Settings", path: "/owner/settings" },
    { icon: Download, label: "Install App", path: "/app" },
  ];

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)] border-b border-border/50">
          <div className="px-4 py-4">
            <h1 className="text-lg font-semibold text-foreground">Profile</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-3">
          {/* AI Briefing Card */}
          {primaryVehicleId && <SmartBriefingCard deviceId={primaryVehicleId} />}

          {/* User Card */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-medium text-foreground truncate">
                    {user?.email?.split("@")[0] || "User"}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{user?.email}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>

          {/* Vehicles Summary */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <button 
                className="w-full flex items-center justify-between"
                onClick={() => navigate("/owner/vehicles")}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Car className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-foreground">My Vehicles</div>
                    {isLoading ? (
                      <Skeleton className="h-3 w-16 mt-1" />
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {vehicles?.length || 0} connected
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>

              {/* Quick vehicle preview */}
              {!isLoading && vehicles && vehicles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2.5">
                  {vehicles.slice(0, 2).map((vehicle) => {
                    const hasNickname = vehicle.nickname && vehicle.nickname !== vehicle.plateNumber;
                    return (
                      <div
                        key={vehicle.deviceId}
                        className="flex items-center gap-3"
                      >
                        {vehicle.avatarUrl ? (
                          <img 
                            src={vehicle.avatarUrl}
                            alt={vehicle.name}
                            className="w-8 h-8 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center">
                            <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">
                            {vehicle.name}
                            {hasNickname && (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({vehicle.plateNumber})
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            vehicle.status === "online"
                              ? "bg-status-active/15 text-status-active text-[10px] px-1.5 py-0"
                              : "bg-muted text-muted-foreground text-[10px] px-1.5 py-0"
                          }
                        >
                          {vehicle.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Menu Items */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-0">
              {menuItems.map((item, index) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors ${
                    index < menuItems.length - 1 ? "border-b border-border/50" : ""
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 text-left text-sm text-foreground">
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Logout */}
          <Button
            variant="ghost"
            className="w-full h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {loggingOut ? "Logging out..." : "Log out"}
          </Button>

          {/* App version */}
          <div className="text-center text-[11px] text-muted-foreground/60 pt-2 pb-4">
            MyMoto v1.1.0 (QA Fixes)
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
