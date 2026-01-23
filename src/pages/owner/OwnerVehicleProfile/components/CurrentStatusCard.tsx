import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WifiOff } from "lucide-react";
import { getOfflineDuration } from "@/utils/timezone";

interface CurrentStatusCardProps {
  status: 'online' | 'charging' | 'offline';
  speed: number | null;
  lastUpdate?: Date | null;
}

export function CurrentStatusCard({ status, speed, lastUpdate }: CurrentStatusCardProps) {
  const offlineDuration = status === 'offline' && lastUpdate ? getOfflineDuration(lastUpdate) : null;
  
  const getStatusInfo = () => {
    switch (status) {
      case 'online':
        return {
          icon: "🚗",
          label: "Online",
          description: (speed ?? 0) > 0 ? `Moving at ${speed} km/h` : "Stationary",
          bgColor: "bg-green-500/20",
        };
      case 'charging':
        return {
          icon: "⚡",
          label: "Charging",
          description: "Parked and charging (or idle)",
          bgColor: "bg-yellow-500/20",
        };
      default:
        return {
          icon: "💤",
          label: "Offline",
          description: offlineDuration ? `Offline for ${offlineDuration}` : "Vehicle is offline - no GPS connection",
          bgColor: "bg-muted",
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground mb-2">Current Status</div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            statusInfo.bgColor
          )}>
            <span className="text-2xl">{statusInfo.icon}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground capitalize">{statusInfo.label}</span>
              {status === 'offline' && (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className={cn(
              "text-sm",
              status === 'offline' ? "text-destructive/80 font-medium" : "text-muted-foreground"
            )}>
              {statusInfo.description}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
