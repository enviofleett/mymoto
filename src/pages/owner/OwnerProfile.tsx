import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import {
  LogOut,
  Mail,
  Phone,
  Car,
  Settings,
  HelpCircle,
  ChevronRight,
  Bell,
  Shield,
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";

export default function OwnerProfile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const [loggingOut, setLoggingOut] = useState(false);

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
  ];

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background px-4 py-4 safe-area-inset-top border-b border-border">
          <h1 className="text-xl font-bold text-foreground">Profile</h1>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* User Card */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                    {user?.email?.[0].toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {user?.email?.split("@")[0] || "User"}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="truncate">{user?.email}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon">
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Vehicles Summary */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-primary/10">
                    <Car className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">My Vehicles</div>
                    {isLoading ? (
                      <Skeleton className="h-4 w-20 mt-1" />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {vehicles?.length || 0} connected
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/owner/vehicles")}
                >
                  View all
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {/* Quick vehicle preview */}
              {!isLoading && vehicles && vehicles.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {vehicles.slice(0, 2).map((vehicle) => (
                    <div
                      key={vehicle.deviceId}
                      className="flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                        <Car className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground text-sm truncate">
                          {vehicle.name}
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Menu Items */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-0">
              {menuItems.map((item, index) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                    index < menuItems.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="p-2 rounded-full bg-muted">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 text-left font-medium text-foreground">
                    {item.label}
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Logout */}
          <Button
            variant="outline"
            className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {loggingOut ? "Logging out..." : "Log out"}
          </Button>

          {/* App version */}
          <div className="text-center text-xs text-muted-foreground py-4">
            MyMoto v1.0.0
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
