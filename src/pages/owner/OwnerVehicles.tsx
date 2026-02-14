import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { useRealtimeFleetUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { usePrefetchVehicleProfile } from "@/hooks/useVehicleProfile";
import { Search, Plus, Car, Wifi, WifiOff, Battery, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import myMotoLogo from "@/assets/mymoto-logo-new.png";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

// Health indicator dot based on battery level
function HealthDot({ battery }: { battery: number | null }) {
  const getColor = () => {
    if (battery === null) return "bg-muted";
    if (battery >= 70) return "bg-status-active";
    if (battery >= 40) return "bg-accent";
    if (battery >= 20) return "bg-accent";
    return "bg-destructive";
  };

  const getLabel = () => {
    if (battery === null) return "Unknown battery";
    if (battery >= 70) return `Healthy (${battery}%)`;
    if (battery >= 40) return `Fair (${battery}%)`;
    if (battery >= 20) return `Low (${battery}%)`;
    return `Critical (${battery}%)`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", getColor())} />
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-card shadow-neumorphic-sm border-0">
          <p className="text-xs">{getLabel()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FleetStatusCard({ 
  icon: Icon, 
  count, 
  label, 
  variant 
}: { 
  icon: React.ElementType; 
  count: number; 
  label: string; 
  variant: "success" | "danger" | "warning";
}) {
  const iconColors = {
    success: "text-status-active",
    danger: "text-destructive",
    warning: "text-accent",
  };
  
  return (
    <div className="rounded-xl p-3 flex flex-col items-center justify-center min-h-[80px] shadow-neumorphic-inset bg-card">
      <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center mb-1">
        <Icon className={cn("h-4 w-4", iconColors[variant])} />
      </div>
      <span className="text-xl font-semibold text-foreground">{count}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function VehicleCard({ vehicle, onClick, onMouseEnter }: { vehicle: OwnerVehicle; onClick: () => void; onMouseEnter: () => void; }) {
  const getStatusColor = () => {
    if (vehicle.status === "online") return "bg-status-active shadow-[0_0_8px_hsl(142_70%_50%/0.5)]";
    if (vehicle.status === "charging") return "bg-accent shadow-[0_0_8px_hsl(24_95%_53%/0.5)]";
    return "bg-muted-foreground";
  };

  // Show plate number in brackets if there's a custom nickname
  const hasNickname = vehicle.nickname && vehicle.nickname !== vehicle.plateNumber;

  return (
    <button 
      className="w-full text-left bg-card border-0 shadow-neumorphic-sm rounded-xl p-4 hover:shadow-neumorphic transition-all duration-200 active:shadow-neumorphic-inset"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="flex items-center gap-3">
        {/* Vehicle Icon/Avatar with neumorphic container */}
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full shadow-neumorphic-sm bg-card p-0.5 overflow-hidden">
            {vehicle.avatarUrl ? (
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                <img 
                  src={vehicle.avatarUrl}
                  alt={vehicle.name}
                  className="max-w-full max-h-full w-auto h-auto object-contain rounded-full"
                />
              </div>
            ) : (
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                <Car className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className={cn(
            "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card transition-all duration-300",
            getStatusColor()
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground text-sm leading-tight truncate">
            {vehicle.name}
            {hasNickname && (
              <span className="text-muted-foreground font-normal ml-1">
                ({vehicle.plateNumber})
              </span>
            )}
          </h3>
          {vehicle.battery !== null && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Battery className="h-3 w-3" />
              <span>{vehicle.battery}%</span>
            </div>
          )}
        </div>

        {/* Health Dot, Status & Arrow */}
        <div className="flex items-center gap-2 shrink-0">
          <HealthDot battery={vehicle.battery} />
          <Badge 
            variant={vehicle.status === "offline" ? "outline" : "secondary"}
            className={cn(
              "text-[10px] uppercase font-medium px-2 py-0.5 rounded-lg border-0 shadow-neumorphic-sm bg-card flex items-center gap-1",
              vehicle.status === "online" 
                ? "text-status-active" 
                : vehicle.status === "charging"
                ? "text-accent"
                : "text-muted-foreground bg-muted/50"
            )}
          >
            {vehicle.status === "offline" && <WifiOff className="h-2.5 w-2.5" />}
            {vehicle.status}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}

import { VehicleRequestDialog } from "@/components/owner/VehicleRequestDialog";

export default function OwnerVehicles() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isRoleLoaded } = useAuth();
  const [statusFilter, setStatusFilter] = useState<Set<OwnerVehicle['status']>>(new Set());
  const [overspeedingOnly, setOverspeedingOnly] = useState(false);
  const [deviceType, setDeviceType] = useState<string>("all");
  const { data: vehicles, isLoading } = useOwnerVehicles({
    status: Array.from(statusFilter),
    overspeedingOnly,
    deviceTypes: deviceType === "all" ? undefined : [deviceType],
  });
  const { prefetchAll } = usePrefetchVehicleProfile();
  const [searchQuery, setSearchQuery] = useState("");

  // Enable real-time updates for all owner vehicles
  const deviceIds = vehicles?.map(v => v.deviceId) || [];
  useRealtimeFleetUpdates(deviceIds);
  
  // Prefetch vehicle profile data on hover for instant loading
  const handleVehicleHover = useCallback((deviceId: string) => {
    prefetchAll(deviceId);
  }, [prefetchAll]);

  const filteredVehicles = vehicles?.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Calculate stats
  const onlineCount = vehicles?.filter(v => v.status === "online").length || 0;
  const offlineCount = vehicles?.filter(v => v.status === "offline").length || 0;
  const chargingCount = vehicles?.filter(v => v.status === "charging").length || 0;

  // React Query can be "not loading" while data is still undefined if a query is disabled/idle.
  // Avoid misleading users with a "No vehicles" empty state in that scenario.
  const showLoadingVehicles = authLoading || !isRoleLoaded || isLoading || vehicles === undefined;

  const handleRefresh = async () => {
    // We can't directly refetch from useOwnerVehicles here without exposing refetch from the hook
    // But React Query will auto-refetch on window focus or we can invalidate queries
    // For now, let's simulate a delay which is often enough if data is realtime
    // Ideally, we should expose refetch from useOwnerVehicles
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  return (
    <OwnerLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="flex flex-col min-h-full">
          {/* Header - extends to status bar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <img alt="MyMoto" className="w-6 h-6 object-contain" src={myMotoLogo} />
                <div>
                  <h1 className="text-xl font-bold text-foreground">My Vehicles</h1>
                  <p className="text-sm text-muted-foreground">Manage your connected vehicles</p>
                </div>
              </div>
              {/* Neumorphic add button */}
              <VehicleRequestDialog 
                trigger={
                  <button className="w-12 h-12 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset ring-2 ring-accent/50">
                    <Plus className="h-5 w-5 text-accent" />
                  </button>
                }
              />
            </div>

            {/* Search - Neumorphic inset style */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/30 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Filters */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant={statusFilter.has("online") ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const next = new Set(statusFilter);
                    if (next.has("online")) next.delete("online"); else next.add("online");
                    setStatusFilter(next);
                  }}
                >
                  Online
                </Button>
                <Button
                  variant={statusFilter.has("offline") ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const next = new Set(statusFilter);
                    if (next.has("offline")) next.delete("offline"); else next.add("offline");
                    setStatusFilter(next);
                  }}
                >
                  Offline
                </Button>
                <Button
                  variant={statusFilter.has("charging") ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const next = new Set(statusFilter);
                    if (next.has("charging")) next.delete("charging"); else next.add("charging");
                    setStatusFilter(next);
                  }}
                >
                  Charging
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={overspeedingOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOverspeedingOnly(prev => !prev)}
                >
                  Overspeeding
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={deviceType} onValueChange={setDeviceType}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Device type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {Array.from(new Set((vehicles || []).map(v => (v.deviceType || "unknown").toLowerCase()))).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 pb-4 space-y-4">
          {/* Fleet Status - Neumorphic card */}
          <Card className="border-0 bg-card shadow-neumorphic rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                  <Car className="h-4 w-4 text-foreground" />
                </div>
                <h2 className="font-medium text-foreground text-sm">Fleet Status</h2>
              </div>
              
              {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-[80px] rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <FleetStatusCard 
                    icon={Wifi} 
                    count={onlineCount} 
                    label="Online" 
                    variant="success"
                  />
                  <FleetStatusCard 
                    icon={WifiOff} 
                    count={offlineCount} 
                    label="Offline" 
                    variant="danger"
                  />
                  <FleetStatusCard 
                    icon={Battery} 
                    count={chargingCount} 
                    label="Charging" 
                    variant="warning"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vehicle List */}
          {showLoadingVehicles ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full shadow-neumorphic bg-card flex items-center justify-center mb-4">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No vehicles</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery ? "No vehicles match your search" : "Add a vehicle to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.deviceId}
                  onMouseEnter={() => handleVehicleHover(vehicle.deviceId)}
                  vehicle={vehicle}
                  onClick={() => navigate(`/owner/vehicle/${vehicle.deviceId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>
    </OwnerLayout>
  );
}
