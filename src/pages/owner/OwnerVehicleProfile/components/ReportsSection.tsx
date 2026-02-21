import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Route,
  CalendarIcon,
  Play,
  ExternalLink,
  MapPin,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Radio,
  Milestone,
  Gauge,
  Clock,
  Brain,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { formatLagos, formatRelativeTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import type { VehicleTrip, VehicleEvent, VehicleDailyStats, VehicleMileageDetail } from "@/hooks/useVehicleProfile";
import type { VehicleIntelligenceSummary } from "@/hooks/useTripAnalytics";
import type { Gps51TripSyncStatus } from "@/hooks/useTripSync";
import { useVehicleMileageDetails } from "@/hooks/useVehicleProfile";
import { useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GeofenceManager } from "@/components/fleet/GeofenceManager";
import { TripSyncProgress } from "@/components/fleet/TripSyncProgress";
import { validateTripContinuity, type ContinuityIssue } from "@/lib/trip-validation";
import { MileageCharts } from "./MileageCharts";

const INTELLIGENCE_THRESHOLDS = {
  fuelVarianceWarning: 0.15,
  fuelVarianceCritical: 0.3,
  fatigueHigh: 70,
  overspeedEventsHigh: 10,
  overspeedEventsCritical: 20,
  safetyEventsIncreaseFraction: 0.25,
  connectivityScoreLow: 60,
  offlineEventsHigh: 5,
  offlineMinutesCritical: 30,
};

interface ReportsSectionProps {
  deviceId: string;
  trips: VehicleTrip[] | undefined;
  events: VehicleEvent[] | undefined;
  dailyStats?: VehicleDailyStats[] | undefined;
  tripsLoading: boolean;
  eventsLoading: boolean;
  statsLoading?: boolean;
   intelligenceSummary?: VehicleIntelligenceSummary | null;
   intelligenceLoading?: boolean;
   intelligenceError?: Error | null;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onRequestTrips: () => void;
  onPlayTrip: (trip: VehicleTrip) => void;
  syncStatus?: Gps51TripSyncStatus | null;
  isSyncing?: boolean;
  onForceSync?: () => void;
  isRealtimeActive?: boolean;
  isAutoSyncing?: boolean;
}

export function ReportsSection({
  deviceId,
  trips,
  // events,
  dailyStats,
  tripsLoading,
  statsLoading,
  intelligenceSummary,
  intelligenceLoading,
  intelligenceError,
  dateRange,
  onDateRangeChange,
  onRequestTrips,
  onPlayTrip,
  syncStatus,
  isSyncing = false,
  onForceSync,
  isRealtimeActive = false,
  isAutoSyncing = false,
}: ReportsSectionProps) {
  const isFilterActive = !!dateRange?.from;
  const lastSyncAt = syncStatus?.last_trip_sync_at ?? null;
  const syncError = syncStatus?.trip_sync_error ?? null;
  const tripsSynced = syncStatus?.trips_synced_count ?? 0;
  const dateRangeLabel = getDateRangeLabel(dateRange);
  
  // Calculate continuity issues for the current set of trips
  const continuityIssues = useMemo(() => {
    if (!trips || trips.length < 2) return new Map<string, ContinuityIssue>();
    
    // Only consider valid trips for continuity
    const validTrips = trips.filter(t => t.start_time && t.end_time);
    const issues = validateTripContinuity(validTrips);
    
    // Map tripId -> Issue (issue where tripId is the *current* trip, meaning gap is before it)
    return new Map(issues.map(i => [i.tripId, i]));
  }, [trips]);

  // CRITICAL DEBUG: Log trips prop when it changes (development only) - MOVED TO useEffect to prevent render-loop logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ReportsSection] Props received:', {
        tripsCount: trips?.length || 0,
        tripsLoading,
        dateRange: dateRange ? `${dateRange.from?.toISOString()} to ${dateRange.to?.toISOString()}` : 'none',
        deviceId
      });
      
      if (trips && trips.length > 0) {
        const tripDates = trips.map(t => t.start_time.split('T')[0]);
        const uniqueDates = [...new Set(tripDates)];
        console.log('[ReportsSection] Trip dates in props:', uniqueDates.sort().reverse());
      }
    }
  }, [trips, tripsLoading, dateRange, deviceId]);

  // Group trips by date and sort within each day (earliest first = Trip 1)
  // Uses LOCAL TIME to fix UTC/Timezone display bug
  const groupedTrips = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    
    const groups: { date: Date; label: string; trips: VehicleTrip[] }[] = [];
    
    // No filtering: show exactly what GPS51 returned and we stored.
    // `end_time` may be null for some rows; the UI should still display them.
    const tripsWithStart = trips.filter(trip => Boolean(trip.start_time));

    tripsWithStart.forEach(trip => {
      const tripDate = new Date(trip.start_time);
      const tripDateStr = formatLagos(tripDate, 'yyyy-MM-dd');
      
      // Find existing group by checking if it's the same Local Day
      const existingGroup = groups.find(g => formatLagos(g.date, 'yyyy-MM-dd') === tripDateStr);
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        const todayStr = formatLagos(new Date(), 'yyyy-MM-dd');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = formatLagos(yesterday, 'yyyy-MM-dd');
        
        if (tripDateStr === todayStr) {
          label = "Today";
        } else if (tripDateStr === yesterdayStr) {
          label = "Yesterday";
        } else {
          label = formatLagos(tripDate, "EEE, MMM d");
        }
        
        groups.push({ date: tripDate, label, trips: [trip] });
      }
    });
    
    // Sort trips within each day by start_time ASC (earliest first = Trip 1)
    groups.forEach(group => {
      group.trips.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    });
    
    // Sort days by date DESC (latest day first)
    const sortedGroups = groups.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return sortedGroups;
  }, [trips]);

  // Events tab removed

  const allTripsCount = trips?.length ?? 0;
  const allTripsDistance = trips?.reduce((sum, t) => sum + (t.distance_km ?? 0), 0) ?? 0;

  // Mileage summary removed

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        {/* Trip Sync Progress */}
        <TripSyncProgress
          deviceId={deviceId}
          isSyncing={isSyncing || isAutoSyncing}
          onRetry={onForceSync}
        />

        {/* Interactive Filter Bar */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                Reports & Analytics
                {(syncStatus || isAutoSyncing) && (
                  <div className="flex items-center gap-1.5 ml-2">
                    {isSyncing || isAutoSyncing ? (
                      <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                    ) : syncStatus?.sync_status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : syncStatus?.sync_status === "error" ? (
                      <AlertCircle className="h-3 w-3 text-red-500" />
                    ) : null}
                    {isRealtimeActive && (
                      <Radio className="h-3 w-3 text-green-500 animate-pulse ml-1" />
                    )}
                  </div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {dateRangeLabel}
              </div>
            </div>
            {onForceSync && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onForceSync}
                disabled={isSyncing}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")} />
                Sync Trips
              </Button>
            )}
          </div>

          {/* Unified filter moved to page level */}
        </div>

        {/* Sync Status Details */}
        {syncStatus && (lastSyncAt || syncStatus.sync_status === "error") && (
          <div className="mb-3 p-2 rounded-md bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>
                {lastSyncAt ? `Last synced: ${formatRelativeTime(lastSyncAt)}` : "No successful sync yet"}
              </span>
              {tripsSynced > 0 && (
                <span className="text-green-600 font-medium">
                  +{tripsSynced} trip{tripsSynced !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {syncStatus.sync_status === "error" && syncError && (
              <div className="mt-1 text-red-500 text-xs">
                Error: {syncError}
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="trips" className="w-full">
          <TabsList className="flex w-full justify-center md:justify-center overflow-x-auto mb-4">
            <TabsTrigger value="trips" className="text-sm">
              <Route className="h-4 w-4 mr-2" />
              Trips
            </TabsTrigger>
            <TabsTrigger value="mileage" className="text-sm">
              <Gauge className="h-4 w-4 mr-2" />
              Mileage
            </TabsTrigger>
            <TabsTrigger value="geofence" className="text-sm">
              <MapPin className="h-4 w-4 mr-2" />
              Geofence
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="text-sm">
              <Brain className="h-4 w-4 mr-2" />
              Intelligence
            </TabsTrigger>
          </TabsList>

          {/* Trips Tab */}
          <TabsContent value="trips" className="mt-0">
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {tripsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !trips && !isFilterActive ? (
                // On-Demand Report Setup State
                <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center bg-muted/20 rounded-lg border border-dashed border-border/50">
                  <div className="bg-primary/10 p-4 rounded-full">
                    <Route className="h-8 w-8 text-primary" />
                  </div>
                  <div className="max-w-full sm:max-w-xs space-y-2">
                    <h3 className="font-semibold text-lg">Trip Reports</h3>
                    <p className="text-sm text-muted-foreground">
                      Use the filters above to select a date range and generate a report.
                    </p>
                  </div>
                </div>
              ) : !trips && isFilterActive ? (
                 // Date selected but not requested yet (or reset state)
                 <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <p className="text-sm text-muted-foreground">Ready to generate report for selected dates.</p>
                    <Button onClick={onRequestTrips}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Generate Report
                    </Button>
                 </div>
              ) : groupedTrips.length > 0 ? (
                groupedTrips.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-card/95 backdrop-blur z-10 py-1">
                      {group.label} ({group.trips.length} trip{group.trips.length !== 1 ? 's' : ''})
                    </div>
                    {group.trips.map((trip, index) => {
                      const issue = continuityIssues.get(trip.id);
                      return (
                        <div key={trip.id} className="space-y-2">
                          <TripCard
                            trip={trip}
                            index={index}
                            onPlayTrip={onPlayTrip}
                            continuityIssue={issue}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No trips recorded for this period</p>
                  <p className="mt-1 text-xs opacity-80">Source: GPS51</p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    {onForceSync && (
                      <Button variant="outline" size="sm" onClick={onForceSync}>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Sync Trips
                      </Button>
                    )}
                    <Button variant="link" onClick={() => onDateRangeChange(undefined)}>
                      Reset Filter
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {trips && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total trips</span>
                  <div>
                    <span className="font-medium">{allTripsCount} trips</span>
                    <span className="text-primary ml-2">{allTripsDistance.toFixed(1)} km</span>
                  </div>
                </div>
            )}
          </TabsContent>

          {/* Mileage Tab */}
          <TabsContent value="mileage" className="mt-0">
            <div className="space-y-6 max-h-[600px] overflow-y-auto pr-1">
              <MileageCharts 
                data={dailyStats} 
                isLoading={!!statsLoading} 
              />

              {/* Detailed Daily Breakdown List */}
              {dailyStats && dailyStats.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-card/95 backdrop-blur z-10 py-1 flex justify-between px-2">
                    <span>Detailed Log</span>
                  </div>
                  {dailyStats.map((stat) => (
                    <div 
                      key={stat.stat_date}
                      className="p-3 rounded-lg bg-muted/40 border border-border/80 flex items-center justify-between hover:bg-muted/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                          <CalendarIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {formatLagos(new Date(stat.stat_date), "EEE, MMM d")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {stat.trip_count} trip{stat.trip_count !== 1 ? 's' : ''} • {Math.round(stat.total_duration_seconds / 60)} min
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm">
                          {stat.total_distance_km.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">km</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Max {Math.round(stat.peak_speed || 0)} km/h
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Geofence Tab */}
          <TabsContent value="geofence" className="mt-0">
            <div className="max-h-[600px] overflow-y-auto">
              <GeofenceManager deviceId={deviceId} />
            </div>
          </TabsContent>

          <TabsContent value="intelligence" className="mt-0">
            <IntelligenceTab
              deviceId={deviceId}
              summary={intelligenceSummary}
              loading={!!intelligenceLoading}
              error={intelligenceError}
              dailyStats={dailyStats}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface IntelligenceTabProps {
  deviceId: string;
  summary?: VehicleIntelligenceSummary | null;
  loading: boolean;
  error?: Error | null;
  dailyStats?: VehicleDailyStats[] | undefined;
}

function IntelligenceTab({ deviceId, summary, loading, error, dailyStats }: IntelligenceTabProps) {
  const { user } = useAuth();
  const [specBaselineLPer100km, setSpecBaselineLPer100km] = useState<number | null>(null);
  const liveQuery = useVehicleLiveData(deviceId);
  const live = liveQuery.data;
  const { data: mileageDetails } = useVehicleMileageDetails(deviceId, undefined, undefined, true);

  const fatigueIndex = summary?.fatigue_index ?? 0;
  const fatigueLevel = summary?.fatigue_level ?? "low";
  const connectivityScore = summary?.connectivity_score ?? 0;
  const lateNightTrips = summary?.late_night_trips_7d ?? 0;
  const idleMinutes = summary?.idle_minutes_7d ?? 0;
  const offlineEvents = summary?.offline_events_7d ?? 0;
  const hardBraking = summary?.hard_braking_events_7d ?? 0;
  const overspeedEvents = summary?.overspeed_events_7d ?? 0;
  const safetyThisWeek = summary?.safety_events_this_week ?? 0;
  const safetyLastWeek = summary?.safety_events_last_week ?? 0;

  const clampedFatigue = Math.max(0, Math.min(100, fatigueIndex));

  useEffect(() => {
    let active = true;
    const loadSpecs = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("vehicle_specifications")
          .select(
            "manufacturer_fuel_consumption_combined, manufacturer_fuel_consumption_city, manufacturer_fuel_consumption_highway, estimated_current_fuel_consumption",
          )
          .eq("device_id", deviceId)
          .maybeSingle();

        if (error) {
          return;
        }

        if (!data || !active) {
          return;
        }

        const estimated = (data as any).estimated_current_fuel_consumption as number | null;
        const combined = (data as any).manufacturer_fuel_consumption_combined as number | null;
        const city = (data as any).manufacturer_fuel_consumption_city as number | null;
        const highway = (data as any).manufacturer_fuel_consumption_highway as number | null;

        const base =
          estimated ??
          combined ??
          (city != null && highway != null ? (city + highway) / 2 : null);

        setSpecBaselineLPer100km(base);
      } catch {
      }
    };

    loadSpecs();

    return () => {
      active = false;
    };
  }, [deviceId]);

  const fuelStats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return {
        currentDistance: 0,
        previousDistance: 0,
        estimatedCurrentLiters: 0,
        estimatedPreviousLiters: 0,
        baselineLPer100km: specBaselineLPer100km ?? 8,
      };
    }

    const sorted = [...dailyStats].sort((a, b) => a.stat_date.localeCompare(b.stat_date));
    const recent = sorted.slice(-7);
    const past = sorted.slice(-14, -7);

    const sumDistance = (items: VehicleDailyStats[]) =>
      items.reduce((total, stat) => total + (stat.total_distance_km || 0), 0);

    const currentDistance = sumDistance(recent);
    const previousDistance = sumDistance(past);

    const baselineEfficiency = specBaselineLPer100km ?? 8;

    const estimatedCurrentLiters = currentDistance > 0 ? (currentDistance * baselineEfficiency) / 100 : 0;
    const estimatedPreviousLiters = previousDistance > 0 ? (previousDistance * baselineEfficiency) / 100 : 0;

    return {
      currentDistance,
      previousDistance,
      estimatedCurrentLiters,
      estimatedPreviousLiters,
      baselineLPer100km: baselineEfficiency,
    };
  }, [dailyStats, specBaselineLPer100km]);

  const realtimeAlerts = useMemo(() => {
    const alerts: {
      id: string;
      severity: "critical" | "warning" | "info";
      label: string;
      message: string;
      category: "fuel" | "safety" | "behavior" | "connectivity";
    }[] = [];

    if (specBaselineLPer100km && mileageDetails && mileageDetails.length > 0) {
      const recent = (mileageDetails as VehicleMileageDetail[]).slice(0, 7);
      const withActual = recent.filter((m) => m.oilper100km !== null);
      if (withActual.length > 0) {
        const avgActual =
          withActual.reduce((sum, m) => sum + (m.oilper100km || 0), 0) / withActual.length;
        const diff = avgActual - specBaselineLPer100km;
        const diffFraction = diff / specBaselineLPer100km;
        if (diffFraction > INTELLIGENCE_THRESHOLDS.fuelVarianceCritical) {
          alerts.push({
            id: "fuel-critical",
            severity: "critical",
            label: "Fuel efficiency anomaly",
            message: `Actual consumption is about ${(diffFraction * 100).toFixed(0)}% higher than baseline.`,
            category: "fuel",
          });
        } else if (diffFraction > INTELLIGENCE_THRESHOLDS.fuelVarianceWarning) {
          alerts.push({
            id: "fuel-warning",
            severity: "warning",
            label: "Fuel efficiency drop",
            message: `Consumption is trending ${(diffFraction * 100).toFixed(0)}% above normal.`,
            category: "fuel",
          });
        }
      }
    }

    if (clampedFatigue >= INTELLIGENCE_THRESHOLDS.fatigueHigh || lateNightTrips > 0) {
      alerts.push({
        id: "behavior-fatigue",
        severity: clampedFatigue >= INTELLIGENCE_THRESHOLDS.fatigueHigh + 10 ? "critical" : "warning",
        label: "Driver fatigue risk",
        message:
          clampedFatigue >= INTELLIGENCE_THRESHOLDS.fatigueHigh
            ? `Fatigue index ${clampedFatigue}/100 with ${lateNightTrips} late-night trips.`
            : `${lateNightTrips} late-night trips recorded recently.`,
        category: "behavior",
      });
    }

    if (overspeedEvents >= INTELLIGENCE_THRESHOLDS.overspeedEventsCritical) {
      alerts.push({
        id: "safety-overspeed-critical",
        severity: "critical",
        label: "Frequent overspeeding",
        message: `${overspeedEvents} overspeed events in the last 7 days.`,
        category: "safety",
      });
    } else if (overspeedEvents >= INTELLIGENCE_THRESHOLDS.overspeedEventsHigh) {
      alerts.push({
        id: "safety-overspeed",
        severity: "warning",
        label: "Overspeeding pattern",
        message: `${overspeedEvents} overspeed events in the last 7 days.`,
        category: "safety",
      });
    }

    if (hardBraking > 0 && safetyThisWeek >= safetyLastWeek) {
      alerts.push({
        id: "safety-braking",
        severity: "warning",
        label: "Harsh braking events",
        message: `${hardBraking} hard braking events this week.`,
        category: "safety",
      });
    }

    if (safetyLastWeek > 0) {
      const change = safetyThisWeek - safetyLastWeek;
      const frac = change / safetyLastWeek;
      if (change > 0 && frac >= INTELLIGENCE_THRESHOLDS.safetyEventsIncreaseFraction) {
        alerts.push({
          id: "safety-trend",
          severity: "warning",
          label: "Rising safety incidents",
          message: `Safety events are up by about ${(frac * 100).toFixed(0)}% week-over-week.`,
          category: "safety",
        });
      }
    }

    if (
      connectivityScore < INTELLIGENCE_THRESHOLDS.connectivityScoreLow ||
      offlineEvents >= INTELLIGENCE_THRESHOLDS.offlineEventsHigh ||
      live?.isOnline === false
    ) {
      let severity: "critical" | "warning" = "warning";
      let message = "";

      if (live?.isOnline === false && live.lastUpdate) {
        const minutesOffline = (Date.now() - live.lastUpdate.getTime()) / 60000;
        if (minutesOffline >= INTELLIGENCE_THRESHOLDS.offlineMinutesCritical) {
          severity = "critical";
          message = `Vehicle appears offline for about ${minutesOffline.toFixed(0)} minutes.`;
        } else {
          message = `Vehicle is currently offline; recent offline events: ${offlineEvents}.`;
        }
      } else if (offlineEvents >= INTELLIGENCE_THRESHOLDS.offlineEventsHigh) {
        message = `${offlineEvents} offline events in the last 7 days.`;
      } else {
        message = `Connectivity score is ${connectivityScore}/100.`;
      }

      alerts.push({
        id: "connectivity",
        severity,
        label: "Connectivity issues",
        message,
        category: "connectivity",
      });
    }

    const severityRank: Record<"critical" | "warning" | "info", number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };

    return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }, [
    specBaselineLPer100km,
    mileageDetails,
    clampedFatigue,
    lateNightTrips,
    overspeedEvents,
    hardBraking,
    safetyThisWeek,
    safetyLastWeek,
    connectivityScore,
    offlineEvents,
    live,
  ]);

  if (loading && !summary) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!summary) {
    if (error) {
      return (
        <div className="space-y-2 text-sm text-destructive">
          <div>Unable to load intelligence data.</div>
          <div className="text-xs text-muted-foreground">{error.message}</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-2 text-center">
        <Milestone className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No intelligence data available yet.</p>
        <p className="text-xs text-muted-foreground">
          Drive normally for a few days to build up behavior insights.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] max-h-[600px] overflow-y-auto pr-1">
      <div className="space-y-4">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-primary uppercase tracking-wide">
                  Intelligence behavior summary
                </div>
                <div className="text-sm text-muted-foreground">
                  Key behavior and risk indicators for this vehicle
                </div>
              </div>
              <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                Fatigue {clampedFatigue}/100
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Connectivity
                </div>
                <div className="text-sm font-semibold">{connectivityScore}/100</div>
                <div className="text-[11px] text-muted-foreground">
                  Offline events: {offlineEvents}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Safety events
                </div>
                <div className="text-sm font-semibold">{safetyThisWeek}</div>
                <div className="text-[11px] text-muted-foreground">
                  Last week: {safetyLastWeek}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Fuel estimate
                </div>
                <div className="text-sm font-semibold">
                  {fuelStats.estimatedCurrentLiters.toFixed(1)} L
                </div>
                <div className="text-[11px] text-muted-foreground">
                  vs {fuelStats.estimatedPreviousLiters.toFixed(1)} L last week
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {realtimeAlerts.length > 0 && (
          <Card className="border-border bg-card/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground uppercase tracking-wide">
                    Intelligence alerts
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prioritized issues from fuel, safety, behavior, and connectivity
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {realtimeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                      alert.severity === "critical"
                        ? "border-destructive/60 bg-destructive/5"
                        : alert.severity === "warning"
                          ? "border-amber-500/60 bg-amber-500/5"
                          : "border-border bg-muted/40",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "h-3 w-3 mt-0.5",
                        alert.severity === "critical"
                          ? "text-destructive"
                          : alert.severity === "warning"
                            ? "text-amber-500"
                            : "text-muted-foreground",
                      )}
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{alert.label}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                            alert.severity === "critical"
                              ? "bg-destructive text-destructive-foreground"
                              : alert.severity === "warning"
                                ? "bg-amber-500 text-amber-950"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {alert.severity === "critical"
                            ? "Urgent"
                            : alert.severity === "warning"
                              ? "Warning"
                              : "Info"}
                        </span>
                      </div>
                      <p className="text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function getDateRangeLabel(dateRange: DateRange | undefined): string {
  if (!dateRange?.from || !dateRange.to) {
    return "All time";
  }

  const from = dateRange.from;
  const to = dateRange.to;

  const fromStr = formatLagos(from, "yyyy-MM-dd");
  const toStr = formatLagos(to, "yyyy-MM-dd");

  const todayStr = formatLagos(new Date(), "yyyy-MM-dd");

  if (fromStr === todayStr && toStr === todayStr) {
    return formatLagos(from, "dd MMM yyyy");
  }

  const diffMs = new Date(toStr).getTime() - new Date(fromStr).getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

  if (toStr === todayStr && days === 7) {
    return "Last 7 days";
  }

  if (toStr === todayStr && days === 30) {
    return "Last 30 days";
  }

  const sameYear = from.getFullYear() === to.getFullYear();

  if (sameYear) {
    const fromLabel = formatLagos(from, "dd MMM");
    const toLabel = formatLagos(to, "dd MMM yyyy");
    return `${fromLabel} – ${toLabel}`;
  }

  const fromLabel = formatLagos(from, "dd MMM yyyy");
  const toLabel = formatLagos(to, "dd MMM yyyy");
  return `${fromLabel} – ${toLabel}`;
}

function TripCard({ 
  trip, 
  index, 
  onPlayTrip,
  continuityIssue
}: { 
  trip: VehicleTrip; 
  index: number; 
  onPlayTrip: (trip: VehicleTrip) => void;
  continuityIssue?: ContinuityIssue;
}) {
  const observerOptions = useMemo(() => ({ rootMargin: "200px" }), []);
  const { ref, isInView } = useInView<HTMLDivElement>(observerOptions);
  const hasValidStartCoords =
    trip.start_latitude != null &&
    trip.start_longitude != null &&
    trip.start_latitude !== 0 &&
    trip.start_longitude !== 0;
  const hasValidEndCoords =
    trip.end_latitude != null &&
    trip.end_longitude != null &&
    trip.end_latitude !== 0 &&
    trip.end_longitude !== 0;
  
  const canPlayback = hasValidStartCoords && hasValidEndCoords;
  
  const { address: startAddress, isLoading: startLoading } = useAddress(
    isInView && hasValidStartCoords ? trip.start_latitude : null, 
    isInView && hasValidStartCoords ? trip.start_longitude : null
  );
  const { address: endAddress, isLoading: endLoading } = useAddress(
    isInView && hasValidEndCoords ? trip.end_latitude : null, 
    isInView && hasValidEndCoords ? trip.end_longitude : null
  );

  const getGoogleMapsLink = (lat: number, lon: number) => {
    return `https://www.google.com/maps?q=${lat},${lon}`;
  };

  const durationMinutes = useMemo(() => {
    if (typeof trip.duration_seconds === "number" && Number.isFinite(trip.duration_seconds)) {
      return Math.round(trip.duration_seconds / 60);
    }
    if (trip.end_time) {
      const start = new Date(trip.start_time).getTime();
      const end = new Date(trip.end_time).getTime();
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return Math.round((end - start) / 60000);
      }
    }
    return null;
  }, [trip.duration_seconds, trip.start_time, trip.end_time]);

  const isIdling = trip.distance_km === 0;
  const distanceLabel = trip.distance_km == null ? "--" : trip.distance_km.toFixed(1);
  const avgSpeedLabel = trip.avg_speed == null ? "--" : String(Math.round(trip.avg_speed));
  const maxSpeedLabel = trip.max_speed == null ? "--" : String(Math.round(trip.max_speed));

  return (
    <div ref={ref} className="p-4 rounded-lg bg-muted/40 border border-border/80 hover:bg-muted/80 transition-colors">
      {/* Header: Trip Title, Time & Play Button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Trip {index + 1}</h3>
            {continuityIssue && (
              <Badge variant="outline" className={cn(
                "text-[10px] h-5 px-1.5 font-normal",
                continuityIssue.severity === 'error' 
                  ? "border-red-500/40 text-red-600"
                  : "border-yellow-500/40 text-yellow-600"
              )}>
                <AlertTriangle className={cn(
                  "h-3 w-3 mr-1",
                  continuityIssue.severity === 'error' ? "text-red-500" : "text-yellow-500"
                )} />
                Gap {continuityIssue.distanceGapKm}km/{continuityIssue.timeGapMinutes}m
              </Badge>
            )}
            {isIdling && trip.distance_km != null && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal bg-blue-500/10 text-blue-600 border-blue-200">
                Idling
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatLagos(trip.start_time, 'h:mm a')} - {trip.end_time ? formatLagos(trip.end_time, 'h:mm a') : '--'}
          </p>
        </div>
        {canPlayback && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPlayTrip(trip)}
            title="Play trip"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Stats Section - Enhanced with max speed */}
      <div className="grid grid-cols-4 gap-3 mb-4 text-center">
        <div className="flex flex-col items-center justify-center">
          <Milestone className="h-4 w-4 text-primary mb-1" />
          <span className="text-sm font-bold">{distanceLabel}</span>
          <span className="text-[10px] text-muted-foreground">km</span>
        </div>
        <div className="flex flex-col items-center justify-center">
          <Clock className="h-4 w-4 text-primary mb-1" />
          <span className="text-sm font-bold">
            {durationMinutes === null ? "--" : durationMinutes >= 60
              ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
              : `${durationMinutes}m`
            }
          </span>
          <span className="text-[10px] text-muted-foreground">duration</span>
        </div>
        <div className="flex flex-col items-center justify-center">
          <Gauge className="h-4 w-4 text-blue-500 mb-1" />
          <span className="text-sm font-bold">{avgSpeedLabel}</span>
          <span className="text-[10px] text-muted-foreground">avg km/h</span>
        </div>
        <div className="flex flex-col items-center justify-center">
          <Gauge className={cn(
            "h-4 w-4 mb-1",
            (trip.max_speed ?? 0) > 120 ? "text-red-500" :
            (trip.max_speed ?? 0) > 80 ? "text-orange-500" : "text-green-500"
          )} />
          <span className={cn(
            "text-sm font-bold",
            (trip.max_speed ?? 0) > 120 ? "text-red-600" : ""
          )}>
            {maxSpeedLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">max km/h</span>
        </div>
      </div>

      {/* From/To Section */}
      <div className="space-y-1">
        {/* Start Address */}
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-green-500 mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            {startLoading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <p className="text-xs text-foreground line-clamp-2">
                {hasValidStartCoords
                  ? (startAddress || "Address not found")
                  : "Location unavailable (GPS51 missing coordinates)"
                }
              </p>
            )}
          </div>
          {hasValidStartCoords && (
             <a
              href={getGoogleMapsLink(trip.start_latitude as number, trip.start_longitude as number)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 shrink-0"
              title="View on Google Maps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        
        {/* Vertical line */}
        <div className="pl-[8px]">
          <div className="h-4 w-px bg-border ml-px"></div>
        </div>

        {/* End Address */}
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-red-500 mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            {endLoading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <p className="text-xs text-foreground line-clamp-2">
                {hasValidEndCoords
                  ? (endAddress || "Address not found")
                  : "Location unavailable (GPS51 missing coordinates)"
                }
              </p>
            )}
          </div>
          {hasValidEndCoords && (
             <a
              href={getGoogleMapsLink(trip.end_latitude as number, trip.end_longitude as number)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 shrink-0"
              title="View on Google Maps"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {!canPlayback && !isIdling && (
        <div className="mt-3">
          <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600 font-normal">
            <AlertTriangle className="h-3 w-3 mr-1.5" />
            Playback unavailable due to incomplete GPS data.
          </Badge>
        </div>
      )}
    </div>
  );
}

function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, options);

    observer.observe(node);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isInView };
}
