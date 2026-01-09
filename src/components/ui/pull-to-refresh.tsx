import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;
  const scale = 0.5 + progress * 0.5;
  const opacity = Math.min(progress * 1.5, 1);

  if (pullDistance <= 0 && !isRefreshing) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{ height: `${Math.max(pullDistance, isRefreshing ? 40 : 0)}px` }}
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full bg-primary/10",
          isRefreshing && "animate-pulse"
        )}
        style={{
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 text-primary transition-transform duration-200",
            isRefreshing && "animate-spin"
          )}
          style={{
            transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
          }}
        />
      </div>
    </div>
  );
}
