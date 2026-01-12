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
      <Card className="border-0 bg-card shadow-neumorphic rounded-2xl overflow-hidden">
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
      <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full shadow-neumorphic-inset bg-card flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">No GPS Signal</p>
          <p className="text-xs text-muted-foreground mt-1">
            Vehicle location is unavailable
          </p>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={cn(
              "mt-4 px-4 py-2 rounded-full shadow-neumorphic-sm bg-card text-sm font-medium text-foreground transition-all duration-200",
              "hover:shadow-neumorphic active:shadow-neumorphic-inset",
              "disabled:opacity-50"
            )}
          >
            <RefreshCw className={cn("h-4 w-4 inline mr-2", isRefreshing && "animate-spin")} />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  console.log('[VehicleMapSection] Rendering map with:', { latitude, longitude, heading, speed, isOnline });

  return (
    <div className="relative">
      {/* Neumorphic map container */}
      <div className="rounded-2xl shadow-neumorphic overflow-hidden">
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
          className="rounded-2xl"
        />
      </div>
      {/* Neumorphic refresh button */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          "absolute top-3 left-3 w-10 h-10 rounded-full bg-card/90 backdrop-blur-sm shadow-neumorphic-sm z-20",
          "flex items-center justify-center transition-all duration-200",
          "hover:shadow-neumorphic active:shadow-neumorphic-inset",
          "disabled:opacity-50"
        )}
      >
        <RefreshCw className={cn("h-4 w-4 text-foreground", isRefreshing && "animate-spin")} />
      </button>
    </div>
  );
}
