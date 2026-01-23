import { useState, useMemo } from "react";
import { ArrowLeft, Settings, Car, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getPersonalityLabel } from "@/hooks/useVehicleProfile";
import { formatUpdatedTime, getOfflineDuration } from "@/utils/timezone";
import { Badge } from "@/components/ui/badge";

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
  const [imageError, setImageError] = useState(false);

  // Format time directly from lastUpdate prop to ensure realtime updates
  // Use useMemo with lastUpdate?.getTime() as dependency to ensure it updates
  const displayTime = useMemo(() => {
    if (!lastUpdate) return '';
    return formatUpdatedTime(lastUpdate);
  }, [lastUpdate?.getTime()]);

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
          {/* Neumorphic avatar container - Increased by 20% (from 96px to 115px) */}
          <div className="relative w-[115px] h-[115px] rounded-full shadow-neumorphic p-1 bg-card overflow-hidden">
            {avatarUrl && !imageError ? (
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                <img 
                  src={avatarUrl} 
                  alt={displayName}
                  className="max-w-full max-h-full w-auto h-auto object-contain rounded-full"
                  loading="eager"
                  decoding="async"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    console.warn('[ProfileHeader] Failed to load avatar image:', avatarUrl);
                    setImageError(true);
                  }}
                  onLoad={() => {
                    setImageError(false);
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[ProfileHeader] Avatar image loaded successfully:', avatarUrl);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                <Car className="h-14 w-14 text-muted-foreground" />
              </div>
            )}
          </div>
          {/* Status indicator with glow - Scaled proportionally */}
          <div
            className={cn(
              "absolute bottom-1 right-1 w-6 h-6 rounded-full border-[3px] border-card transition-all duration-300",
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
        {displayTime && (
          <p className="text-[11px] text-muted-foreground mt-1" key={`time-${lastUpdate?.getTime()}`}>
            Updated {displayTime}
          </p>
        )}
        {status === 'offline' && lastUpdate && (
          <Badge 
            variant="outline" 
            className="mt-2 bg-muted/50 text-muted-foreground border-muted flex items-center gap-1.5"
          >
            <WifiOff className="h-3 w-3" />
            <span>Offline {getOfflineDuration(lastUpdate) ? `for ${getOfflineDuration(lastUpdate)}` : ''}</span>
          </Badge>
        )}
      </div>
    </>
  );
}
