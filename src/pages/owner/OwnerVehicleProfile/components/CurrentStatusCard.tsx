import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CurrentStatusCardProps {
  status: 'online' | 'charging' | 'offline';
  speed: number | null;
}

export function CurrentStatusCard({ status, speed }: CurrentStatusCardProps) {
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
          description: "Vehicle is offline",
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
          <div>
            <div className="font-medium text-foreground capitalize">{statusInfo.label}</div>
            <div className="text-sm text-muted-foreground">{statusInfo.description}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
