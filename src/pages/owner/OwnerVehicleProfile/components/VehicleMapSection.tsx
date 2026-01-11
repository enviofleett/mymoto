import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
import { RefreshCw, MapPin } from "lucide-react";
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
}: VehicleMapSectionProps) {
  if (!latitude || !longitude) {
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
        </CardContent>
      </Card>
    );
  }

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
