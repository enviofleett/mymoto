import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { Search, Plus, Car, Wifi, WifiOff, Battery, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const styles = {
    success: "bg-status-active/10 text-status-active",
    danger: "bg-status-inactive/10 text-status-inactive",
    warning: "bg-status-maintenance/10 text-status-maintenance",
  };
  
  return (
    <div className={cn(
      "rounded-lg p-3 flex flex-col items-center justify-center min-h-[80px] border border-border/50",
      styles[variant]
    )}>
      <Icon className="h-4 w-4 mb-1" />
      <span className="text-xl font-semibold">{count}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</span>
    </div>
  );
}

function VehicleCard({ vehicle, onClick }: { vehicle: OwnerVehicle; onClick: () => void }) {
  const getStatusColor = () => {
    if (vehicle.status === "online") return "bg-status-active";
    if (vehicle.status === "charging") return "bg-status-maintenance";
    return "bg-muted-foreground";
  };

  return (
    <button 
      className="w-full text-left bg-card border border-border/50 rounded-xl p-4 hover:bg-muted/30 transition-colors active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Vehicle Icon */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Car className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className={cn(
            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
            getStatusColor()
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground text-sm leading-tight">{vehicle.name}</h3>
          {vehicle.battery !== null && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Battery className="h-3 w-3" />
              <span>{vehicle.battery}%</span>
            </div>
          )}
        </div>

        {/* Status & Arrow */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge 
            variant="secondary" 
            className={cn(
              "text-[10px] uppercase font-medium px-2 py-0.5 rounded-md",
              vehicle.status === "online" 
                ? "bg-status-active/15 text-status-active" 
                : vehicle.status === "charging"
                ? "bg-status-maintenance/15 text-status-maintenance"
                : "bg-muted text-muted-foreground"
            )}
          >
            {vehicle.status}
          </Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}

export default function OwnerVehicles() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading } = useOwnerVehicles();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVehicles = vehicles?.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Calculate stats
  const onlineCount = vehicles?.filter(v => v.status === "online").length || 0;
  const offlineCount = vehicles?.filter(v => v.status === "offline").length || 0;
  const chargingCount = vehicles?.filter(v => v.status === "charging").length || 0;

  return (
    <OwnerLayout>
      <div className="flex flex-col min-h-full">
        {/* Header - extends to status bar */}
        <div className="sticky top-0 z-10 bg-background pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-xl font-bold text-foreground">My Vehicles</h1>
                <p className="text-sm text-muted-foreground">Manage your connected vehicles</p>
              </div>
              <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 h-11 w-11 shadow-lg shadow-primary/20">
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/40 border-border/50 h-11 rounded-xl focus-visible:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 pb-4 space-y-4">
          {/* Fleet Status */}
          <Card className="border-border/50 bg-card/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-4 w-4 text-primary" />
                <h2 className="font-medium text-foreground text-sm">Fleet Status</h2>
              </div>
              
          {isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-[80px] rounded-lg" />)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
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
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Car className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No vehicles</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery ? "No vehicles match your search" : "Add a vehicle to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.deviceId}
                  vehicle={vehicle}
                  onClick={() => navigate(`/owner/vehicle/${vehicle.deviceId}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
