import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { LocationCell } from "@/components/fleet/LocationCell";
import { 
  Truck, 
  MapPin, 
  Gauge, 
  Battery, 
  Power, 
  Clock, 
  User,
  Navigation,
  AlertTriangle,
  Wifi,
  WifiOff,
  Route
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getOfflineDuration } from "@/utils/vehicleStatus";

interface VehiclePosition {
  latitude: number | null;
  longitude: number | null;
  speed: number;
  battery_percent: number | null;
  ignition_on: boolean | null;
  is_online: boolean;
  is_overspeeding: boolean;
  gps_time: string | null;
  total_mileage: number | null;
}

interface AssignedVehicle {
  device_id: string;
  vehicle_alias: string | null;
  device_name: string;
  gps_owner: string | null;
  group_name: string | null;
  position: VehiclePosition | null;
}

interface VehicleCardProps {
  vehicle: AssignedVehicle;
  onPlayTrip?: (deviceId: string, deviceName: string) => void;
}

export function VehicleCard({ vehicle, onPlayTrip }: VehicleCardProps) {
  const pos = vehicle.position;
  const isOnline = pos?.is_online ?? false;
  const isMoving = pos?.speed && pos.speed > 0;
  const isOverspeeding = pos?.is_overspeeding ?? false;

  const getStatusBadge = () => {
    if (!isOnline) {
      return (
        <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted">
          <WifiOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      );
    }
    if (isOverspeeding) {
      return (
        <Badge variant="destructive" className="animate-pulse">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Overspeeding
        </Badge>
      );
    }
    if (isMoving) {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <Navigation className="h-3 w-3 mr-1" />
          Moving
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
        <Wifi className="h-3 w-3 mr-1" />
        Stopped
      </Badge>
    );
  };

  const getBatteryColor = (percent: number) => {
    if (percent < 20) return "text-destructive";
    if (percent < 50) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <Card className="border-border bg-card hover:bg-card/80 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isOnline ? 'bg-primary/10' : 'bg-muted'}`}>
              <Truck className={`h-5 w-5 ${isOnline ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {vehicle.vehicle_alias || vehicle.device_name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{vehicle.device_id}</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Speed & Mileage */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" />
              <span className="text-xs">Speed</span>
            </div>
            <p className={`text-lg font-bold ${isOverspeeding ? 'text-destructive' : 'text-foreground'}`}>
              {pos?.speed ?? 0} km/h
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span className="text-xs">Mileage</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {pos?.total_mileage ? `${(pos.total_mileage / 1000).toFixed(0)} km` : 'N/A'}
            </p>
          </div>
        </div>

        {/* Location Address */}
        {pos?.latitude && pos?.longitude && (
          <div className="pt-2 border-t border-border">
            <LocationCell lat={pos.latitude} lon={pos.longitude} />
          </div>
        )}

        {/* Battery & Ignition */}
        <div className="space-y-2">
          {pos?.battery_percent !== null && pos?.battery_percent !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Battery className="h-3.5 w-3.5" />
                  <span>Battery</span>
                </div>
                <span className={getBatteryColor(pos.battery_percent)}>
                  {pos.battery_percent}%
                </span>
              </div>
              <Progress 
                value={pos.battery_percent} 
                className="h-1.5" 
              />
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Power className="h-3.5 w-3.5" />
              <span>Ignition</span>
            </div>
            <Badge 
              variant="outline" 
              className={pos?.ignition_on 
                ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                : 'bg-muted text-muted-foreground'
              }
            >
              {pos?.ignition_on ? 'ON' : 'OFF'}
            </Badge>
          </div>
        </div>

        {/* Last Update / Offline Status */}
        {pos?.gps_time && (
          <div className="flex items-center gap-1.5 text-xs pt-2 border-t border-border">
            {!isOnline ? (
              <div className="flex items-center gap-1.5 text-destructive/80">
                <WifiOff className="h-3 w-3" />
                <span className="font-medium">
                  Offline {(() => {
                    const duration = getOfflineDuration(new Date(pos.gps_time));
                    return duration ? `for ${duration}` : '';
                  })()}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Last update: {formatDistanceToNow(new Date(pos.gps_time), { addSuffix: true })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* GPS Owner */}
        {vehicle.gps_owner && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Owner: {vehicle.gps_owner}</span>
          </div>
        )}

        {/* Trip Playback Button */}
        {onPlayTrip && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-2"
            onClick={() => onPlayTrip(vehicle.device_id, vehicle.vehicle_alias || vehicle.device_name)}
          >
            <Route className="h-4 w-4 mr-2" />
            View Trip Playback
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
