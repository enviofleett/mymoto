import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
import { RefreshCw, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface VehicleMapSectionProps {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speed: number | null;
  address: string | null;
  vehicleName: string;
  isOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function VehicleMapSection({
  latitude,
  longitude,
  heading,
  speed,
  address,
  vehicleName,
  isOnline,
  isRefreshing,
  onRefresh,
  isLoading = false,
}: VehicleMapSectionProps) {
  // Show loading skeleton while data is being fetched
  if (isLoading) {
    return (
      <Card className="border-border bg-card/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="h-80 relative">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-muted/50 animate-pulse mb-3" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show no GPS signal state
  if (latitude === null || longitude === null) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No GPS Signal</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Vehicle location is unavailable
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  console.log('[VehicleMapSection] Rendering map with:', { latitude, longitude, heading, speed, isOnline });

  return (
    <div className="relative">
      <VehicleLocationMap
        latitude={latitude}
        longitude={longitude}
        heading={heading}
        speed={speed}
        address={address}
        vehicleName={vehicleName}
        isOnline={isOnline}
        showAddressCard={true}
        mapHeight="h-80"
        className="rounded-xl shadow-lg"
      />
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-3 left-3 h-9 w-9 bg-card/80 backdrop-blur-sm shadow-md z-20"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
      </Button>
    </div>
  );
}
