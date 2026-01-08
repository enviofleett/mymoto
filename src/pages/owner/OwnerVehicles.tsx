import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerVehicles, OwnerVehicle } from "@/hooks/useOwnerVehicles";
import { Search, Plus, Car, Wifi, WifiOff, Moon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const avatarColors = [
  "from-blue-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-orange-500 to-red-500",
  "from-green-500 to-emerald-500",
  "from-pink-500 to-rose-500",
];

function FleetStatusCard({ 
  icon: Icon, 
  count, 
  label, 
  colorClass 
}: { 
  icon: any; 
  count: number; 
  label: string; 
  colorClass: string;
}) {
  return (
    <div className={cn("rounded-xl p-4 flex flex-col items-center justify-center", colorClass)}>
      <Icon className="h-5 w-5 mb-2 opacity-80" />
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );
}

function VehicleCard({ vehicle, index, onClick }: { vehicle: OwnerVehicle; index: number; onClick: () => void }) {
  const colorClass = avatarColors[index % avatarColors.length];

  return (
    <Card className="border-border bg-card/50 hover:bg-card transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className={cn(
              "w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center",
              colorClass
            )}>
              <span className="text-2xl">🚗</span>
            </div>
            <div className={cn(
              "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card",
              vehicle.status === "online" ? "bg-green-500" :
              vehicle.status === "charging" ? "bg-yellow-500" : "bg-muted-foreground"
            )} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0" onClick={onClick}>
            <h3 className="font-semibold text-foreground">{vehicle.name}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {vehicle.deviceType || "Vehicle"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] uppercase font-semibold",
                  vehicle.status === "online" 
                    ? "border-green-500/50 text-green-500" 
                    : vehicle.status === "charging"
                    ? "border-yellow-500/50 text-yellow-500"
                    : "border-muted-foreground/50 text-muted-foreground"
                )}
              >
                {vehicle.status}
              </Badge>
              {vehicle.battery !== null && (
                <span className="text-xs text-muted-foreground">
                  {vehicle.battery}% battery
                </span>
              )}
            </div>
          </div>

          {/* Edit button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 h-10 w-10 rounded-full"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background px-4 py-4 safe-area-inset-top">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-xl font-bold text-foreground">My Vehicles</h1>
              <p className="text-sm text-muted-foreground">Manage your connected vehicles</p>
            </div>
            <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 h-11 w-11">
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50 border-0 h-11"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 pb-4 space-y-4">
          {/* Fleet Status */}
          <Card className="border-border bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Car className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-foreground">Fleet Status</h2>
              </div>
              
              {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <FleetStatusCard 
                    icon={Wifi} 
                    count={onlineCount} 
                    label="Online" 
                    colorClass="bg-green-500/10 text-green-500"
                  />
                  <FleetStatusCard 
                    icon={WifiOff} 
                    count={offlineCount} 
                    label="Offline" 
                    colorClass="bg-red-500/10 text-red-500"
                  />
                  <FleetStatusCard 
                    icon={Moon} 
                    count={chargingCount} 
                    label="Busy" 
                    colorClass="bg-yellow-500/10 text-yellow-500"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vehicle List */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-14 w-14 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Car className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-foreground mb-2">No vehicles</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery ? "No vehicles match your search" : "Add a vehicle to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVehicles.map((vehicle, index) => (
                <VehicleCard
                  key={vehicle.deviceId}
                  vehicle={vehicle}
                  index={index}
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
