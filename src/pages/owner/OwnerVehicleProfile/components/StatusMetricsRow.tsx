import { Card, CardContent } from "@/components/ui/card";
import { Battery, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusMetricsRowProps {
  battery: number | null;
  totalMileage: number | null;
}

export function StatusMetricsRow({ battery, totalMileage }: StatusMetricsRowProps) {
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
      {/* Battery - Neumorphic inset style */}
      <Card className="border-0 bg-card shadow-neumorphic-inset rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Battery className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Battery</span>
          </div>
          <div className={cn("text-2xl font-bold", getBatteryColor(battery))}>
            {battery !== null ? `${battery}%` : "--%"}
          </div>
          <div className="text-xs text-muted-foreground">{getBatteryStatus(battery)}</div>
        </CardContent>
      </Card>

      {/* Mileage - Neumorphic inset style */}
      <Card className="border-0 bg-card shadow-neumorphic-inset rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <Gauge className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Mileage</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalMileage !== null 
              ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
              : "--"} <span className="text-sm font-normal text-muted-foreground">km</span>
          </div>
          <div className="text-xs text-muted-foreground">Total</div>
        </CardContent>
      </Card>
    </div>
  );
}
