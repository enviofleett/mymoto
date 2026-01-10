import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useDriverScore,
  getScoreColor,
  getScoreLabel,
} from "@/hooks/useTripAnalytics";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Zap,
  CornerDownRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DriverScoreCardProps {
  deviceId: string;
  compact?: boolean;
}

export function DriverScoreCard({ deviceId, compact = false }: DriverScoreCardProps) {
  const { data: scoreData, isLoading, error } = useDriverScore(deviceId);

  if (isLoading) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className={compact ? "p-4" : "p-6"}>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !scoreData || scoreData.trips_analyzed === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className={compact ? "p-4" : "p-6"}>
          <div className="flex items-center gap-3 text-muted-foreground">
            <Activity className="h-5 w-5" />
            <span className="text-sm">No driving data available yet</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { driver_score, harsh_braking_count, harsh_acceleration_count, recent_trend, trips_analyzed } = scoreData;
  const scoreColor = getScoreColor(driver_score);
  const scoreLabel = getScoreLabel(driver_score);

  const TrendIcon = recent_trend === 'improving' ? TrendingUp :
                    recent_trend === 'declining' ? TrendingDown : Minus;
  
  const trendColor = recent_trend === 'improving' ? 'text-green-500' :
                     recent_trend === 'declining' ? 'text-red-500' : 'text-muted-foreground';

  if (compact) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold",
                  "bg-gradient-to-br from-primary/20 to-primary/5 border-2",
                  driver_score >= 75 ? "border-green-500/50" : 
                  driver_score >= 50 ? "border-yellow-500/50" : "border-red-500/50"
                )}>
                  <span className={scoreColor}>{driver_score}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Driver Score</span>
                  <TrendIcon className={cn("h-4 w-4", trendColor)} />
                </div>
                <p className="text-xs text-muted-foreground">{scoreLabel}</p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {trips_analyzed} trips
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Driver Score
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-48">
                  Score based on driving behavior analysis. Harsh events reduce the score.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold",
              "bg-gradient-to-br from-primary/20 to-primary/5 border-4",
              driver_score >= 75 ? "border-green-500/50" : 
              driver_score >= 50 ? "border-yellow-500/50" : "border-red-500/50"
            )}>
              <span className={scoreColor}>{driver_score}</span>
            </div>
            <div className={cn(
              "absolute -bottom-1 -right-1 p-1 rounded-full bg-background",
              trendColor
            )}>
              <TrendIcon className="h-4 w-4" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className={cn("font-semibold", scoreColor)}>{scoreLabel}</span>
              <Badge variant="outline" className="text-xs">
                {trips_analyzed} trips analyzed
              </Badge>
            </div>
            <Progress 
              value={driver_score} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {recent_trend === 'improving' ? 'Improving over recent trips' :
               recent_trend === 'declining' ? 'Declining over recent trips' : 
               'Stable performance'}
            </p>
          </div>
        </div>

        {/* Harsh Events Breakdown */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{harsh_braking_count}</p>
              <p className="text-xs text-muted-foreground">Hard Braking</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-orange-500/10">
              <Zap className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{harsh_acceleration_count}</p>
              <p className="text-xs text-muted-foreground">Hard Accel</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
