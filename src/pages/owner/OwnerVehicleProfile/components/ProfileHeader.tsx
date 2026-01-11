import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getPersonalityLabel } from "@/hooks/useVehicleProfile";

interface ProfileHeaderProps {
  displayName: string;
  vehicleName: string;
  avatarUrl: string | null;
  personalityMode: string | null;
  status: 'online' | 'charging' | 'offline';
  lastUpdate: Date | null;
  onBack: () => void;
  onSettings: () => void;
}

export function ProfileHeader({
  displayName,
  vehicleName,
  avatarUrl,
  personalityMode,
  status,
  lastUpdate,
  onBack,
  onSettings,
}: ProfileHeaderProps) {
  const showOriginalName = displayName !== vehicleName;

  return (
    <>
      {/* Top Navigation */}
      <div className="sticky top-0 z-10 bg-background px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onSettings}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Profile Section */}
      <div className="flex flex-col items-center py-6 px-4">
        <div className="relative mb-4">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Car className="h-9 w-9 text-muted-foreground" />
            </div>
          )}
          <div
            className={cn(
              "absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-background",
              status === "online"
                ? "bg-status-active"
                : status === "charging"
                ? "bg-status-maintenance"
                : "bg-muted-foreground"
            )}
          />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          {displayName}
          {showOriginalName && (
            <span className="text-muted-foreground font-normal text-sm ml-1">
              ({vehicleName})
            </span>
          )}
        </h1>
        {personalityMode && (
          <p className="text-xs text-muted-foreground mt-1">
            {getPersonalityLabel(personalityMode)}
          </p>
        )}
        {lastUpdate && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Updated {format(lastUpdate, "MMM d, HH:mm")}
          </p>
        )}
      </div>
    </>
  );
}
