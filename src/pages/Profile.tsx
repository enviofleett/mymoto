import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Truck, 
  Phone, 
  Mail, 
  CreditCard, 
  Calendar,
  Navigation,
  Gauge,
  Power,
  History,
  Bell,
  Wallet,
  LogOut
} from "lucide-react";
import { formatLagos } from "@/lib/timezone";
import { VehicleCard } from "@/components/profile/VehicleCard";
import { TripHistoryTable } from "@/components/profile/TripHistoryTable";
import { AlarmReport } from "@/components/profile/AlarmReport";
import { TripPlayback } from "@/components/profile/TripPlayback";
import { WalletSection } from "@/components/wallet/WalletSection";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { EmailSettings } from "@/components/settings/EmailSettings";
import { TermsAgreementDate } from "@/components/profile/TermsAgreementDate";

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  status: string;
  created_at: string;
}

interface AssignedVehicle {
  device_id: string;
  vehicle_alias: string | null;
  device_name: string;
  gps_owner: string | null;
  group_name: string | null;
  position: {
    latitude: number | null;
    longitude: number | null;
    speed: number;
    battery_percent: number | null;
    ignition_on: boolean | null;
    is_online: boolean;
    is_overspeeding: boolean;
    gps_time: string | null;
    total_mileage: number | null;
  } | null;
}

interface VehicleAssignmentRow {
  device_id: string;
  vehicle_alias: string | null;
  vehicles: {
    device_name: string | null;
    gps_owner: string | null;
    group_name: string | null;
  } | null;
  vehicle_positions: {
    latitude: number | null;
    longitude: number | null;
    speed: number | null;
    battery_percent: number | null;
    ignition_on: boolean | null;
    is_online: boolean | null;
    is_overspeeding: boolean | null;
    gps_time: string | null;
    total_mileage: number | null;
  } | null;
}

const Profile = () => {
  const { user, isAdmin, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [assignedVehicles, setAssignedVehicles] = useState<AssignedVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [playbackVehicle, setPlaybackVehicle] = useState<{ deviceId: string; deviceName: string } | null>(null);
  
  const defaultTab = searchParams.get("tab") || "vehicles";

  const assignedVehicleIds = useMemo(
    () => assignedVehicles.map((v) => v.device_id),
    [assignedVehicles]
  );

  // Enable realtime updates for all assigned vehicles (safe even if empty)
  useRealtimeFleetUpdates(assignedVehicleIds);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const fetchUserData = useCallback(async () => {
    try {
      if (!user?.id && !user?.email) return;
      setLoading(true);

      // First check if user has a profile linked
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error fetching profile:", profileError);
      }

      // If no profile exists with user_id, try to find by email
      let finalProfile = (profileData as UserProfile | null) ?? null;
      if (!profileData && user?.email) {
        const { data: emailProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", user.email)
          .maybeSingle();
        
        finalProfile = (emailProfile as UserProfile | null) ?? null;
      }

      setProfile(finalProfile);

      // Fetch assigned vehicles with current positions
      if (finalProfile) {
        const { data: assignments, error: assignError } = await supabase
          .from("vehicle_assignments")
          .select(`
            device_id,
            vehicle_alias,
            vehicles (
              device_name,
              gps_owner,
              group_name
            ),
            vehicle_positions (
              latitude,
              longitude,
              speed,
              battery_percent,
              ignition_on,
              is_online,
              is_overspeeding,
              gps_time,
              total_mileage
            )
          `)
          .eq("profile_id", finalProfile.id);

        if (assignError) {
          console.error("Error fetching assignments:", assignError);
        } else if (assignments) {
          const rows = assignments as VehicleAssignmentRow[];
          const vehiclesWithPositions: AssignedVehicle[] = rows.map((a) => ({
            device_id: a.device_id,
            vehicle_alias: a.vehicle_alias,
            device_name: a.vehicles?.device_name || a.device_id,
            gps_owner: a.vehicles?.gps_owner || null,
            group_name: a.vehicles?.group_name || null,
            position: a.vehicle_positions ? {
              latitude: a.vehicle_positions.latitude,
              longitude: a.vehicle_positions.longitude,
              speed: a.vehicle_positions.speed ?? 0,
              battery_percent: a.vehicle_positions.battery_percent,
              ignition_on: a.vehicle_positions.ignition_on,
              is_online: a.vehicle_positions.is_online ?? false,
              is_overspeeding: a.vehicle_positions.is_overspeeding ?? false,
              gps_time: a.vehicle_positions.gps_time,
              total_mileage: a.vehicle_positions.total_mileage
            } : null
          }));
          setAssignedVehicles(vehiclesWithPositions);
        }
      }
    } catch (err: unknown) {
      console.error("Error loading user data:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user, fetchUserData]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "inactive":
        return "bg-muted text-muted-foreground";
      case "on_leave":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 pb-32">
          <div className="flex items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // If no profile linked, show basic user info or admin settings
  if (!profile) {
    // For admins, show settings tabs even without a profile
    if (isAdmin) {
      const handleRefresh = async () => {
        // For now just wait a bit, as admin profile doesn't have data fetching
        await new Promise(resolve => setTimeout(resolve, 500));
      };

      return (
        <DashboardLayout>
          <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-6">
            <Card className="border-border bg-card">
              <CardContent className="p-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <Avatar className="h-24 w-24 border-4 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {user?.email?.[0].toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{user?.email}</h1>
                    <p className="text-muted-foreground mt-1">Administrator</p>
                  </div>
                  <Badge variant="default" className="mt-2">
                    Admin Account
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Tabbed Content for Admin Settings */}
            <Tabs defaultValue={searchParams.get("tab") || "email"} className="space-y-4">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="email" className="data-[state=active]:bg-background">
                  <Mail className="h-4 w-4 mr-2" />
                  Email Settings
                </TabsTrigger>
                <TabsTrigger value="logout" className="data-[state=active]:bg-background">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </TabsTrigger>
              </TabsList>

              {/* Email Settings Tab */}
              <TabsContent value="email" className="mt-4">
                <EmailSettings />
              </TabsContent>

              {/* Logout Tab */}
              <TabsContent value="logout" className="mt-4">
                <Card className="border-border bg-card">
                  <CardContent className="p-8 text-center">
                    <LogOut className="h-12 w-12 mx-auto text-destructive mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Are you sure you want to log out?</h3>
                    <p className="text-muted-foreground mb-6">You will be redirected to the login page.</p>
                    <Button 
                      variant="destructive" 
                      className="w-full sm:w-auto min-w-[200px]" 
                      onClick={handleLogout}
                    >
                      Log Out
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          </PullToRefresh>
        </DashboardLayout>
      );
    }

    // For non-admin users without profile
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Card className="border-border bg-card">
            <CardContent className="p-8">
              <div className="flex flex-col items-center text-center space-y-4">
                <Avatar className="h-24 w-24 border-4 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {user?.email?.[0].toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{user?.email}</h1>
                  <p className="text-muted-foreground mt-1">Logged in User</p>
                </div>
                <Badge variant="outline" className="mt-2">
                  No Driver Profile Linked
                </Badge>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your account is not linked to a driver profile yet. Contact your administrator 
                  to assign you to a driver profile and vehicles.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Get primary vehicle for AI insights
  const primaryVehicleId = assignedVehicles[0]?.device_id || null;
  
  // Stats summary
  const onlineVehicles = assignedVehicles.filter(v => v.position?.is_online).length;
  const movingVehicles = assignedVehicles.filter(v => v.position?.speed && v.position.speed > 0).length;
  const overspeedingCount = assignedVehicles.filter(v => v.position?.is_overspeeding).length;

  const handleRefresh = async () => {
    await fetchUserData();
  };

  return (
    <DashboardLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="space-y-6 pb-32">
        {/* Profile Header */}
        <Card className="border-border bg-gradient-to-br from-card to-card/80">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              {/* Avatar */}
              <Avatar className="h-24 w-24 border-4 border-primary/20 shadow-lg">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>

              {/* User Info */}
              <div className="flex-1 space-y-3">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
                  <p className="text-muted-foreground">Fleet Driver</p>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  {profile.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{profile.email}</span>
                    </div>
                  )}
                  {profile.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{profile.phone}</span>
                    </div>
                  )}
                  {profile.license_number && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      <span>{profile.license_number}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Since {formatLagos(new Date(profile.created_at), "MMM yyyy")}</span>
                  </div>
                </div>
                {/* Terms Agreement Date */}
                <TermsAgreementDate userId={user?.id} />
              </div>

              {/* Status Badge */}
              <Badge className={`${getStatusColor(profile.status)} px-4 py-2 text-sm`}>
                {profile.status.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{assignedVehicles.length}</p>
                  <p className="text-xs text-muted-foreground">Assigned Vehicles</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Power className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{onlineVehicles}</p>
                  <p className="text-xs text-muted-foreground">Online Now</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Navigation className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{movingVehicles}</p>
                  <p className="text-xs text-muted-foreground">Moving Now</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${overspeedingCount > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                  <Gauge className={`h-5 w-5 ${overspeedingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{overspeedingCount}</p>
                  <p className="text-xs text-muted-foreground">Overspeeding</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="vehicles" className="data-[state=active]:bg-background">
              <Truck className="h-4 w-4 mr-2" />
              My Vehicles
            </TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-background">
              <Wallet className="h-4 w-4 mr-2" />
              Wallet
            </TabsTrigger>
            <TabsTrigger value="trips" className="data-[state=active]:bg-background">
              <History className="h-4 w-4 mr-2" />
              Trip History
            </TabsTrigger>
            <TabsTrigger value="alarms" className="data-[state=active]:bg-background">
              <Bell className="h-4 w-4 mr-2" />
              Alarm Reports
            </TabsTrigger>
            <TabsTrigger value="email" className="data-[state=active]:bg-background">
              <Mail className="h-4 w-4 mr-2" />
              Email Settings
            </TabsTrigger>
            <TabsTrigger value="logout" className="data-[state=active]:bg-background">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </TabsTrigger>
          </TabsList>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles" className="mt-4">
            {assignedVehicles.length === 0 ? (
              <Card className="border-border bg-card">
                <CardContent className="p-8 text-center">
                  <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground">No Vehicles Assigned</h3>
                  <p className="text-muted-foreground mt-1">
                    You don't have any vehicles assigned to your profile yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {playbackVehicle && (
                  <TripPlayback
                    deviceId={playbackVehicle.deviceId}
                    deviceName={playbackVehicle.deviceName}
                    onClose={() => setPlaybackVehicle(null)}
                  />
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {assignedVehicles.map((vehicle) => (
                    <VehicleCard 
                      key={vehicle.device_id} 
                      vehicle={vehicle} 
                      onPlayTrip={(deviceId, deviceName) => setPlaybackVehicle({ deviceId, deviceName })}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="mt-4">
            <WalletSection />
          </TabsContent>

          {/* Trips Tab */}
          <TabsContent value="trips" className="mt-4">
            <TripHistoryTable 
              deviceIds={assignedVehicles.map(v => v.device_id)} 
              vehicles={assignedVehicles}
            />
          </TabsContent>

          {/* Alarms Tab */}
          <TabsContent value="alarms" className="mt-4">
            <AlarmReport 
              deviceIds={assignedVehicles.map(v => v.device_id)}
              vehicles={assignedVehicles}
            />
          </TabsContent>

          {/* Email Settings Tab */}
          <TabsContent value="email" className="mt-4">
            <EmailSettings />
          </TabsContent>

          {/* Logout Tab */}
          <TabsContent value="logout" className="mt-4">
            <Card className="border-border bg-card">
              <CardContent className="p-8 text-center">
                <LogOut className="h-12 w-12 mx-auto text-destructive mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Are you sure you want to log out?</h3>
                <p className="text-muted-foreground mb-6">You will be redirected to the login page.</p>
                <Button 
                  variant="destructive" 
                  className="w-full sm:w-auto min-w-[200px]" 
                  onClick={handleLogout}
                >
                  Log Out
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </PullToRefresh>
    </DashboardLayout>
  );
};

export default Profile;
