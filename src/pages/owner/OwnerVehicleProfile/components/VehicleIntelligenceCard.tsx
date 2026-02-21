import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Timer, WifiOff, Zap, Gauge, Activity, TrendingUp, TrendingDown, Minus, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer } from "recharts";
import type { VehicleIntelligenceSummary } from "@/hooks/useTripAnalytics";
import { getTrendDirection } from "@/hooks/useTripAnalytics";

type IntelligenceView = "overview" | "safety" | "connectivity";

interface VehicleIntelligenceCardProps {
  summary: VehicleIntelligenceSummary | null | undefined;
  isLoading: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function VehicleIntelligenceCard({ summary, isLoading, error, onRetry }: VehicleIntelligenceCardProps) {
  const [view, setView] = useState<IntelligenceView>("overview");

  const fatigueValue = summary?.fatigue_index ?? 0;
  const fatigueLabel = summary?.fatigue_level ?? "low";
  const idleMinutes = summary?.idle_minutes_7d ?? 0;
  const connectivityScore = summary?.connectivity_score ?? 0;
  const lateNightTrips = summary?.late_night_trips_7d ?? 0;
  const hardBraking = summary?.hard_braking_events_7d ?? 0;
  const overspeedEvents = summary?.overspeed_events_7d ?? 0;
  const offlineEvents = summary?.offline_events_7d ?? 0;
  const safetyEventsThisWeek = summary?.safety_events_this_week ?? 0;

  const clampedFatigue = Math.max(0, Math.min(100, fatigueValue));

  let fatigueColor = "bg-emerald-500";
  if (clampedFatigue >= 70) {
    fatigueColor = "bg-red-500";
  } else if (clampedFatigue >= 30) {
    fatigueColor = "bg-amber-500";
  }

  const idleLabel =
    idleMinutes >= 60
      ? `${(idleMinutes / 60).toFixed(1)} h`
      : `${Math.round(idleMinutes)} min`;

  let overallRiskLabel: "Low" | "Medium" | "High" = "Low";
  let overallRiskClass =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border-emerald-500/40";

  if (clampedFatigue >= 70 || connectivityScore <= 40 || safetyEventsThisWeek >= 8) {
    overallRiskLabel = "High";
    overallRiskClass =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium bg-red-500/10 text-red-500 border-red-500/40";
  } else if (clampedFatigue >= 30 || connectivityScore <= 70 || safetyEventsThisWeek >= 3) {
    overallRiskLabel = "Medium";
    overallRiskClass =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-500 border-amber-500/40";
  }

  const trend = summary
    ? (() => {
      const current = summary.safety_events_this_week ?? 0;
      const previous = summary.safety_events_last_week ?? 0;
      const diff = current - previous;
      const trendLabel =
        current < previous ? "improving" : current > previous ? "declining" : "stable";
      const direction = getTrendDirection(trendLabel);
      return { direction, current, previous, diff };
    })()
    : null;

  const safetyTrendData =
    trend && (trend.current > 0 || trend.previous > 0)
      ? [
          { label: "Last week", value: trend.previous },
          { label: "This week", value: trend.current },
        ]
      : null;

  const tiles = [
    {
      id: "late-nights",
      group: "safety" as const,
      icon: Moon,
      title: "Late Night Trips",
      value: lateNightTrips.toString(),
      subtitle: "Last 7 days",
    },
    {
      id: "idle-time",
      group: "connectivity" as const,
      icon: Timer,
      title: "Total Idle Time",
      value: idleLabel,
      subtitle: "Last 7 days",
    },
    {
      id: "connectivity",
      group: "connectivity" as const,
      icon: WifiOff,
      title: "Connectivity Score",
      value: `${connectivityScore}/100`,
      subtitle: trend
        ? trend.direction === "up"
          ? "Fewer safety events than last week"
          : trend.direction === "down"
            ? "More safety events than last week"
            : "Safety events stable"
        : "Trend data not available",
      trend,
    },
    {
      id: "hard-braking",
      group: "safety" as const,
      icon: Zap,
      title: "Hard Braking",
      value: hardBraking.toString(),
      subtitle: "Last 7 days",
    },
    {
      id: "overspeeding",
      group: "safety" as const,
      icon: Gauge,
      title: "Overspeeding Events",
      value: overspeedEvents.toString(),
      subtitle: "Last 7 days",
    },
    {
      id: "fatigue",
      group: "connectivity" as const,
      icon: Activity,
      title: "Fatigue Level",
      value: `${clampedFatigue}/100`,
      subtitle: `Offline alerts: ${offlineEvents}`,
    },
  ];

  const visibleTiles = tiles.filter((tile) => {
    if (view === "overview") return true;
    return tile.group === view;
  });

  if (!isLoading && error) {
    return (
      <Card
        className="border-border bg-card/50"
        role="region"
        aria-labelledby="vehicle-intelligence-heading"
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-destructive" aria-hidden="true" />
              <h2
                id="vehicle-intelligence-heading"
                className="text-sm font-medium text-foreground"
              >
                Intelligence &amp; Behavior
              </h2>
            </div>
          </div>
          <div
            className="text-sm text-destructive"
            role="status"
            aria-live="polite"
          >
            Unable to load intelligence data.
          </div>
          <div className="text-xs text-muted-foreground">
            {error.message}
          </div>
          {onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !summary) {
    return (
      <Card
        className="border-border bg-card/50"
        role="region"
        aria-labelledby="vehicle-intelligence-heading"
        aria-busy="true"
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-6 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card
        className="border-border bg-card/50"
        role="region"
        aria-labelledby="vehicle-intelligence-heading"
      >
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2
                id="vehicle-intelligence-heading"
                className="text-sm font-medium text-foreground"
              >
                Intelligence &amp; Behavior
              </h2>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            No analytics available yet. Drive normally to build up behavior insights.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-border bg-card/50"
      role="region"
      aria-labelledby="vehicle-intelligence-heading"
    >
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div>
                <h2
                  id="vehicle-intelligence-heading"
                  className="text-sm font-medium text-foreground"
                >
                  Intelligence &amp; Behavior
                </h2>
                <div className="text-[11px] text-muted-foreground">
                  Summary of driver and vehicle behavior
                </div>
              </div>
            </div>
            <span className={overallRiskClass}>Overall risk: {overallRiskLabel}</span>
          </div>
          <div className="flex items-center gap-1" aria-label="Intelligence views">
            {(["overview", "safety", "connectivity"] as IntelligenceView[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  "px-2 py-1 rounded-full text-[11px] border transition-colors",
                  view === mode
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-card text-muted-foreground border-border"
                )}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {mode === "overview" ? "Overview" : mode === "safety" ? "Safety" : "Connectivity"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Fatigue
              </span>
              <span className="text-sm font-semibold">{clampedFatigue}</span>
              <span className="text-[11px] text-muted-foreground">/100</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Connectivity
              </span>
              <span className="text-sm font-semibold">{connectivityScore}</span>
              <span className="text-[11px] text-muted-foreground">/100</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Safety events
              </span>
              <span className="text-sm font-semibold">{trend?.current ?? 0}</span>
              {trend ? (
                <span className="text-[11px] text-muted-foreground">
                  {trend.diff === 0
                    ? "vs last week"
                    : trend.diff > 0
                      ? `+${trend.diff} vs last week`
                      : `${trend.diff} vs last week`}
                </span>
              ) : null}
            </div>
          </div>
          {view === "safety" && safetyTrendData ? (
            <div className="h-16 w-full sm:w-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safetyTrendData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Fatigue Index</div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{clampedFatigue}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {fatigueLabel}
              </div>
            </div>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-3 rounded-full transition-all duration-300", fatigueColor)}
              style={{ width: `${clampedFatigue}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampedFatigue}
              aria-label={`Fatigue index ${clampedFatigue} out of 100, ${fatigueLabel} fatigue`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.id}
                className="flex items-center gap-3 rounded-xl bg-card shadow-neumorphic-inset p-3"
              >
                <div className="w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{tile.title}</div>
                  <div className="text-sm font-semibold text-foreground">
                    {tile.value}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {tile.id === "connectivity" ? (
                      tile.trend ? (
                        tile.trend.direction === "up" ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                        ) : tile.trend.direction === "down" ? (
                          <TrendingDown className="h-3 w-3 text-red-500" aria-hidden="true" />
                        ) : (
                          <Minus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        )
                      ) : (
                        <Minus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      )
                    ) : null}
                    <span>{tile.subtitle}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
