import { Badge } from "@/components/ui/badge";
import { User, Battery, MapPin, WifiOff } from "lucide-react";
import { FleetVehicle } from "@/hooks/useFleetData";
import { useAddress } from "@/hooks/useAddress";
import { Skeleton } from "@/components/ui/skeleton";

interface VehiclePopupContentProps {
  vehicle: FleetVehicle;
}

export function VehiclePopupContent({ vehicle }: VehiclePopupContentProps) {
  const { address, isLoading } = useAddress(vehicle.lat, vehicle.lon);

  const getStatusVariant = (status: FleetVehicle["status"]) => {
    switch (status) {
      case "moving":
        return "default";
      case "stopped":
        return "secondary";
      case "offline":
        return "outline";
    }
  };

  return (
    <div className="p-1 min-w-[200px]">
      <div className="flex justify-between items-center mb-2 gap-2">
        <h3 className="font-bold text-sm text-foreground">{vehicle.name}</h3>
        <div className="flex items-center gap-1.5">
          {vehicle.status === 'offline' && (
            <Badge variant="outline" className="text-[10px] h-5 bg-muted/50 text-muted-foreground border-muted">
              <WifiOff className="h-2.5 w-2.5 mr-1" />
              Offline
            </Badge>
          )}
          <Badge variant={getStatusVariant(vehicle.status)} className="text-[10px] h-5">
            {vehicle.status === 'offline' ? 'N/A' : `${vehicle.speed} km/h`}
          </Badge>
        </div>
      </div>
      
      {vehicle.status === 'offline' && vehicle.offlineDuration && (
        <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1">
          <WifiOff className="h-3 w-3" />
          <span>Offline for {vehicle.offlineDuration}</span>
        </div>
      )}
      
      {/* Address */}
      <div className="flex items-start gap-1.5 mb-2 text-xs text-muted-foreground">
        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
        {isLoading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <span className="line-clamp-2">{address || `${vehicle.lat?.toFixed(4)}, ${vehicle.lon?.toFixed(4)}`}</span>
        )}
      </div>

      {vehicle.gpsOwner && (
        <p className="text-xs text-muted-foreground mb-2">
          Owner: {vehicle.gpsOwner}
        </p>
      )}
      
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {vehicle.driver?.name || "Unassigned"}
        </div>
        <div className="flex items-center gap-1">
          <Battery className="w-3 h-3" />
          {vehicle.battery !== null ? `${vehicle.battery}%` : "N/A"}
        </div>
      </div>
      
      {vehicle.isOverspeeding && (
        <div className="mt-2 text-xs text-orange-500 font-medium">
          ⚠️ Overspeeding
        </div>
      )}
    </div>
  );
}
