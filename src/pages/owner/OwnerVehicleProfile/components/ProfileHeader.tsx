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
  lastUpdate: Date | null; // last update (gps_time)
  lastGpsFix?: Date | null; // true GPS fix (gps_fix_time)
  lastSyncedAt?: Date | null; // backend sync heartbeat
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
  lastGpsFix,
  lastSyncedAt,
  onBack,
  onSettings,
}: ProfileHeaderProps) {
  const showOriginalName = displayName !== vehicleName;

  return (
    <>
      {/* Top Navigation - Neumorphic buttons */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <button
            onClick={onSettings}
            className="w-10 h-10 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 active:shadow-neumorphic-inset"
          >
            <Settings className="h-5 w-5 text-foreground" />
          </button>
        </div>
      </div>

      {/* Profile Section - Premium styling */}
      <div className="flex flex-col items-center py-6 px-4">
        <div className="relative mb-4">
          {/* Neumorphic avatar container */}
          <div className="w-24 h-24 rounded-full shadow-neumorphic p-1 bg-card">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt={displayName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                <Car className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>
          {/* Status indicator with glow */}
          <div
            className={cn(
              "absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-card transition-all duration-300",
              status === "online"
                ? "bg-status-active shadow-[0_0_12px_hsl(142_70%_50%/0.6)]"
                : status === "charging"
                ? "bg-accent shadow-[0_0_12px_hsl(24_95%_53%/0.6)]"
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
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {lastSyncedAt && (
            <p>
              Last synced {format(lastSyncedAt, "MMM d, HH:mm")}
            </p>
          )}
          {lastUpdate && (
            <p>
              Last update {format(lastUpdate, "MMM d, HH:mm")}
            </p>
          )}
          {lastGpsFix && (
            <p>
              Last GPS fix {format(lastGpsFix, "MMM d, HH:mm")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
