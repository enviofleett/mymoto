import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { useOwnerProfile } from "@/hooks/useOwnerProfile";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { SmartBriefingCard } from "@/components/profile/SmartBriefingCard";
import { EditProfileDialog } from "@/components/owner/EditProfileDialog";
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
  Phone,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function OwnerProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const { data: profile, isLoading: profileLoading } = useOwnerProfile();
  const [loggingOut, setLoggingOut] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Enable real-time updates for owner vehicles
  const deviceIds = vehicles?.map(v => v.deviceId) || [];
  useRealtimeFleetUpdates(deviceIds);

  const handleProfileUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ["owner-profile"] });
  };

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
        {/* Header - Neumorphic styling */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 py-4">
            <h1 className="text-xl font-bold text-foreground">Profile</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* AI Briefing Card */}
          {primaryVehicleId && <SmartBriefingCard deviceId={primaryVehicleId} />}

          {/* User Card - Neumorphic style */}
          <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
            <CardContent className="p-4">
              <button 
                className="w-full flex items-center gap-4 text-left transition-all duration-200 active:scale-[0.99]"
                onClick={() => setEditProfileOpen(true)}
              >
                {/* Neumorphic avatar container */}
                <div className="w-16 h-16 rounded-full shadow-neumorphic-sm bg-card p-0.5 shrink-0">
                  <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                    <User className="h-7 w-7 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {profileLoading ? (
                    <>
                      <Skeleton className="h-5 w-24 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </>
                  ) : (
                    <>
                      <h2 className="text-base font-medium text-foreground truncate">
                        {profile?.name || user?.email?.split("@")[0] || "User"}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{user?.email}</span>
                      </div>
                      {profile?.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Phone className="h-3 w-3" />
                          <span className="truncate">{profile.phone}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Vehicles Summary - Neumorphic style */}
          <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
            <CardContent className="p-4">
              <button 
                className="w-full flex items-center justify-between transition-all duration-200 active:scale-[0.99]"
                onClick={() => navigate("/owner/vehicles")}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                    <Car className="h-5 w-5 text-foreground" />
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
                <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>

              {/* Quick vehicle preview */}
              {!isLoading && vehicles && vehicles.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                  {vehicles.slice(0, 2).map((vehicle) => {
                    const hasNickname = vehicle.nickname && vehicle.nickname !== vehicle.plateNumber;
                    return (
                      <div
                        key={vehicle.deviceId}
                        className="flex items-center gap-3 p-2 rounded-lg shadow-neumorphic-inset bg-card"
                      >
                        <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card p-0.5 shrink-0">
                          {vehicle.avatarUrl ? (
                            <img 
                              src={vehicle.avatarUrl}
                              alt={vehicle.name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                              <Car className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
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
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-lg border-0 shadow-neumorphic-sm bg-card",
                            vehicle.status === "online"
                              ? "text-status-active"
                              : "text-muted-foreground"
                          )}
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

          {/* Menu Items - Neumorphic style */}
          <Card className="border-0 bg-card shadow-neumorphic rounded-xl overflow-hidden">
            <CardContent className="p-0">
              {menuItems.map((item, index) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-all duration-200 active:bg-secondary/50",
                    index < menuItems.length - 1 && "border-b border-border/30"
                  )}
                >
                  <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
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

          {/* Logout - Neumorphic button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(
              "w-full h-12 rounded-xl shadow-neumorphic-sm bg-card text-destructive font-medium transition-all duration-200",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>

          {/* App version */}
          <div className="text-center text-[11px] text-muted-foreground/60 pt-2 pb-4">
            MyMoto v1.1.0 (QA Fixes)
          </div>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <EditProfileDialog
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onProfileUpdated={handleProfileUpdated}
      />
    </OwnerLayout>
  );
}
