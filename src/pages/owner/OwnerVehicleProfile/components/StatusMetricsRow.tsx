import { Card, CardContent } from "@/components/ui/card";
import { Battery, Gauge, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusMetricsRowProps {
  battery: number | null;
  totalMileage: number | null;
  isOnline?: boolean;
}

export function StatusMetricsRow({ battery, totalMileage, isOnline = true }: StatusMetricsRowProps) {
  const getBatteryStatus = (battery: number | null) => {
    if (battery === null) return "Not reported";
    if (battery >= 80) return "Optimal";
    if (battery >= 50) return "Good";
    if (battery >= 20) return "Low";
    return "Critical";
  };

  const getBatteryColor = (battery: number | null) => {
    if (battery === null) return "text-muted-foreground";
    if (battery >= 80) return "text-status-active";
    if (battery >= 50) return "text-accent";
    if (battery >= 20) return "text-accent";
    return "text-destructive";
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Battery */}
      <Card className={cn(
        "border-0 bg-card shadow-neumorphic-inset rounded-xl",
        !isOnline && "opacity-60"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Battery className={cn(
                "h-4 w-4",
                !isOnline ? "text-muted-foreground" : "text-muted-foreground"
              )} />
            </div>
            <span className="text-sm text-muted-foreground">Battery</span>
            {!isOnline && (
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[10px] bg-muted/50">
                <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                Offline
              </Badge>
            )}
          </div>
          <div className={cn("text-2xl font-bold", getBatteryColor(battery))}>
            {!isOnline ? "N/A" : (typeof battery === 'number' ? `${battery}%` : "--%")}
          </div>
          <div className="text-xs text-muted-foreground">
            {!isOnline ? "Data unavailable" : getBatteryStatus(battery)}
          </div>
        </CardContent>
      </Card>

      {/* Mileage */}
      <Card className={cn(
        "border-0 bg-card shadow-neumorphic-inset rounded-xl",
        !isOnline && "opacity-60"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Gauge className={cn(
                "h-4 w-4",
                !isOnline ? "text-muted-foreground" : "text-muted-foreground"
              )} />
            </div>
            <span className="text-sm text-muted-foreground">Mileage</span>
            {!isOnline && (
              <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[10px] bg-muted/50">
                <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                Offline
              </Badge>
            )}
          </div>
          <div className="text-2xl font-bold text-foreground">
            {/* DEFENSIVE FIX: Check strictly for number type */}
            {!isOnline 
              ? "N/A"
              : (typeof totalMileage === 'number'
                ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                : "--")
            } <span className="text-sm font-normal text-muted-foreground">km</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {!isOnline ? "Data unavailable" : "Total"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
