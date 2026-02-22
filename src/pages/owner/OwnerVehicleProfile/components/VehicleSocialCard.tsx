import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/timezone";

type VehicleSocialStatus = "online" | "moving" | "offline";

interface VehicleSocialCardProps {
  deviceId: string;
  name: string;
  plateNumber?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  createdAt?: Date | null;
  status: VehicleSocialStatus;
  lastUpdate?: Date | null;
  onChangeAvatar?: () => void;
}

export function VehicleSocialCard({
  deviceId,
  name,
  plateNumber,
  nickname,
  avatarUrl,
  createdAt,
  status,
  lastUpdate,
  onChangeAvatar,
}: VehicleSocialCardProps) {
  const displayName = nickname || name || plateNumber || deviceId;

  const statusLabel = (() => {
    if (status === "moving") return "Moving";
    if (status === "online") return "Online";
    return "Offline";
  })();

  const statusDotClass = (() => {
    if (status === "moving") return "bg-accent shadow-[0_0_10px_rgba(255,107,0,0.7)]";
    if (status === "online") return "bg-status-active shadow-[0_0_10px_rgba(34,197,94,0.7)]";
    return "bg-muted-foreground";
  })();

  const lastUpdatedLabel = lastUpdate ? formatRelativeTime(lastUpdate) : "No recent activity";

  const registeredLabel = createdAt
    ? createdAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown";

  const showPlateInline = plateNumber && plateNumber !== displayName;

  return (
    <Card className="border-0 bg-card shadow-neumorphic rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full shadow-neumorphic-sm bg-card p-0.5 overflow-hidden">
                {avatarUrl ? (
                  <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="max-w-full max-h-full w-auto h-auto object-contain rounded-full"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full rounded-full bg-secondary flex items-center justify-center">
                    <span className="text-lg" aria-hidden="true">
                      🚗
                    </span>
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card transition-all duration-300",
                  statusDotClass
                )}
              />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground line-clamp-1">
                  {displayName}
                </p>
                {showPlateInline && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                    {plateNumber}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-active" />
                  <span>Joined {registeredLabel}</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5">
                  <span className="font-medium">{statusLabel}</span>
                  <span className="text-[10px] opacity-80">
                    {lastUpdate ? `Updated ${lastUpdatedLabel}` : "No recent update"}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {onChangeAvatar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-[11px] h-8 px-3 rounded-full shadow-neumorphic-sm"
              onClick={onChangeAvatar}
            >
              Change photo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

