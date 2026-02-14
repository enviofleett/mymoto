import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VehiclePersonaSettings } from "@/components/fleet/VehiclePersonaSettings";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { fetchVehicleLiveDataDirect, type VehicleLiveData, useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";
import { useVehicleLLMSettings, useVehicleTrips, useVehicleEvents, useVehicleDailyStats, type VehicleTrip } from "@/hooks/useVehicleProfile";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { supabase } from "@/integrations/supabase/client";
import { type DateRange } from "react-day-picker";
import { preloadMapbox } from "@/utils/loadMapbox";
import { useTripSyncStatus, useTriggerTripSync } from "@/hooks/useTripSync";

// Import sub-components
import { ProfileHeader } from "./components/ProfileHeader";
import { VehicleMapSection } from "./components/VehicleMapSection";
import { CurrentStatusCard } from "./components/CurrentStatusCard";
import { StatusMetricsRow } from "./components/StatusMetricsRow";
import { EngineControlCard } from "./components/EngineControlCard";
import { ReportsSection } from "./components/ReportsSection";

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const resolvedDeviceId = deviceId ?? "";
  const hasDeviceId = Boolean(deviceId);

  // State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [routeCoords, setRouteCoords] = useState<Array<{ lat: number; lon: number }> | undefined>(undefined);
  const [geofenceOverlays, setGeofenceOverlays] = useState<Array<{ latitude: number; longitude: number; radius: number; name?: string }>>([]);
  const [directLiveOverride, setDirectLiveOverride] = useState<{ data: VehicleLiveData; fetchedAt: number } | null>(null);

  // ============================================================================
  // LIVE DATA FETCHING
  // Default: DB (fleet-scale safe, no timeouts)
  // Manual Refresh: one-shot direct GPS51 fetch for "right now" accuracy
  // ============================================================================

  const {
    data: dbLiveData,
    isLoading: liveLoading,
    error: liveError,
    refetch: refetchLive,
  } = useVehicleLiveData(hasDeviceId ? resolvedDeviceId : null);

  // Clear one-shot override when switching vehicles
  useEffect(() => {
    setDirectLiveOverride(null);
  }, [resolvedDeviceId]);

  // Auto-expire the one-shot override so DB polling keeps the UI moving.
  useEffect(() => {
    if (!directLiveOverride) return;
    const ttlMs = 20_000;
    const t = setTimeout(() => setDirectLiveOverride(null), ttlMs);
    return () => clearTimeout(t);
  }, [directLiveOverride]);

  // Keep track of last valid data to prevent UI flashing
  // FALLBACK STRATEGY: Use Live Data -> OwnerVehicle (DB) -> null
  const { data: ownerVehicles } = useOwnerVehicles();
  const vehicle = ownerVehicles?.find((v) => v.deviceId === resolvedDeviceId);

  const displayData = useMemo(() => {
    const now = Date.now();
    const overrideFresh = directLiveOverride && now - directLiveOverride.fetchedAt < 20_000;

    // 1. Prefer Live Data if available and valid
    if (overrideFresh) {
      const liveData = directLiveOverride.data;
      // If live data has null coordinates (e.g. offline), try to fill from DB
      return {
        ...liveData,
        latitude: liveData.latitude ?? vehicle?.latitude ?? null,
        longitude: liveData.longitude ?? vehicle?.longitude ?? null,
        batteryPercent: liveData.batteryPercent ?? vehicle?.battery ?? null,
        totalMileageKm: liveData.totalMileageKm ?? vehicle?.totalMileage ?? null,
        heading: liveData.heading ?? vehicle?.heading ?? null,
        speed: liveData.speed ?? vehicle?.speed ?? 0,
        ignitionOn: liveData.ignitionOn ?? vehicle?.ignition ?? null,
        // Keep live status if available, otherwise fallback
        isOnline: liveData.isOnline, 
      };
    }

    if (dbLiveData) {
      const liveData = dbLiveData;
      return {
        ...liveData,
        latitude: liveData.latitude ?? vehicle?.latitude ?? null,
        longitude: liveData.longitude ?? vehicle?.longitude ?? null,
        batteryPercent: liveData.batteryPercent ?? vehicle?.battery ?? null,
        totalMileageKm: liveData.totalMileageKm ?? vehicle?.totalMileage ?? null,
        heading: liveData.heading ?? vehicle?.heading ?? null,
        speed: liveData.speed ?? vehicle?.speed ?? 0,
        ignitionOn: liveData.ignitionOn ?? vehicle?.ignition ?? null,
        isOnline: liveData.isOnline,
      };
    }

    // 2. Fallback to DB Data (OwnerVehicle) if Live Data failed/loading
    if (vehicle) {
      return {
        deviceId: vehicle.deviceId,
        latitude: vehicle.latitude,
        longitude: vehicle.longitude,
        speed: vehicle.speed,
        heading: vehicle.heading,
        batteryPercent: vehicle.battery,
        ignitionOn: vehicle.ignition,
        isOnline: vehicle.status === 'online' || vehicle.status === 'charging',
        isOverspeeding: vehicle.isOverspeeding,
        totalMileageKm: vehicle.totalMileage,
        statusText: null,
        lastUpdate: vehicle.lastUpdate,
        lastGpsFix: vehicle.lastUpdate, // Approximate
        lastSyncedAt: new Date(),
        syncPriority: 'normal' as const,
      };
    }

    return null;
  }, [directLiveOverride, dbLiveData, vehicle]);

  // Vehicle LLM settings (Avatar, Nickname)
  const { 
    data: llmSettings, 
    refetch: refetchProfile 
  } = useVehicleLLMSettings(resolvedDeviceId, hasDeviceId);

  // Address lookup
  const { address } = useAddress(
    displayData?.latitude ?? null,
    displayData?.longitude ?? null
  );

  // Status derivation: online, charging, or offline
  const status: "online" | "charging" | "offline" = useMemo(() => {
    if (!displayData?.isOnline) {
      return "offline";
    }
    
    // Detect charging/parked state
    const isParked = 
      displayData.ignitionOn === false && 
      displayData.speed === 0;
    
    const hasBatteryData = displayData.batteryPercent !== null;
    const isCharging = isParked && hasBatteryData;
    
    return isCharging ? "charging" : "online";
  }, [displayData?.isOnline, displayData?.batteryPercent, displayData?.ignitionOn, displayData?.speed]);

  // Trips and Events for Reports Section
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  });
  const [shouldFetchTrips, setShouldFetchTrips] = useState(false);
  
  const {
    data: trips, 
    isLoading: tripsLoading,
    refetch: refetchTrips
  } = useVehicleTrips(resolvedDeviceId, { 
    dateRange, 
    live: false, // On-demand reports don't need live polling
    // To match GPS51 1:1 for the selected date range, fetch enough rows to avoid truncation.
    limit: 2000
  }, hasDeviceId && shouldFetchTrips);

  const { 
    data: events, 
    isLoading: eventsLoading 
  } = useVehicleEvents(resolvedDeviceId, { 
    dateRange,
    limit: 50
  }, hasDeviceId);

  // Daily Mileage Stats (Default: Last 30 days, or Custom Range)
  const {
    data: dailyStats,
    isLoading: statsLoading,
    refetch: refetchStats
  } = useVehicleDailyStats(
    resolvedDeviceId, 
    dateRange || 30, // Pass 30 (number) or DateRange object
    hasDeviceId && shouldFetchTrips
  );

  const { data: syncStatus } = useTripSyncStatus(resolvedDeviceId, hasDeviceId);
  const triggerSync = useTriggerTripSync();
  const isSyncing = triggerSync.isPending;

  const handleForceSync = useCallback(() => {
    if (!hasDeviceId) return;
    // Default to 30d so the "Reports last 30 days" UI gets data on first use.
    triggerSync.mutate({ deviceId: resolvedDeviceId, forceFullSync: true });
  }, [hasDeviceId, resolvedDeviceId, triggerSync]);

  const handleRequestTrips = useCallback(() => {
    setShouldFetchTrips(true);
    // Always refetch when requested, regardless of previous state
    refetchTrips();
    refetchStats();
  }, [refetchTrips, refetchStats]);

  useEffect(() => {
    if (hasDeviceId) {
      // Defer heavier reports fetching until after first paint so the map/header feel instant.
      // (Still loads automatically, just not in the critical render path.)
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => setShouldFetchTrips(true), { timeout: 1500 });
      } else {
        setTimeout(() => setShouldFetchTrips(true), 350);
      }
    }
  }, [hasDeviceId]);

  // Warm mapbox chunk early for smoother map load.
  useEffect(() => {
    if (!hasDeviceId) return;
    preloadMapbox();
  }, [hasDeviceId]);

  useEffect(() => {
    const loadGeofences = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('geofence_zones')
          .select('center_latitude, center_longitude, radius_meters, name, is_active')
          .or(`device_id.eq.${resolvedDeviceId},device_id.is.null`)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const zones = (data as any[]).map(z => ({
          latitude: Number(z.center_latitude),
          longitude: Number(z.center_longitude),
          radius: Number(z.radius_meters),
          name: z.name as string | undefined
        })).filter(z => z.latitude && z.longitude && z.radius && z.radius > 0);
        setGeofenceOverlays(zones);
      } catch {
        setGeofenceOverlays([]);
      }
    };
    loadGeofences();
  }, [resolvedDeviceId]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    if (!hasDeviceId) return;

    setIsRefreshing(true);
    
    try {
      // DB refresh is the baseline and should succeed even if the proxy times out.
      const dbResult = refetchLive();
      const profileResult = refetchProfile();

      // Only call the GPS51 proxy on explicit user refresh.
      const directResult = fetchVehicleLiveDataDirect(resolvedDeviceId, { timeoutMs: 12_000 })
        .then((data) => {
          setDirectLiveOverride({ data, fetchedAt: Date.now() });
          return { ok: true as const };
        })
        .catch((err) => {
          return { ok: false as const, err };
        });

      const [db, profile, direct] = await Promise.all([dbResult, profileResult, directResult]);

      if (!direct.ok) {
        const msg = direct.err instanceof Error ? direct.err.message : String(direct.err);
        toast.warning("Live GPS51 timed out", {
          description: msg.includes("timeout") ? "Showing DB live data (last known)" : "Showing DB live data",
        });
      } else {
        toast.success("Updated", {
          description: "Latest live data retrieved",
        });
      }
    } catch (error) {
      toast.error("Refresh failed", { 
        description: "Could not retrieve latest data" 
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [hasDeviceId, refetchLive, refetchProfile, resolvedDeviceId]);

  const { pullDistance, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Display values with safe fallbacks

  const displayName = llmSettings?.nickname || vehicle?.plateNumber || resolvedDeviceId;
  const plateNumber = vehicle?.plateNumber || resolvedDeviceId;
  const avatarUrl = llmSettings?.avatar_url || null;
  const personalityMode = llmSettings?.personality_mode || null;

  // Loading and error states
  const isInitialLoading = liveLoading && !displayData;
  const hasCriticalError = liveError !== null && !displayData;
  const hasNoData = !liveLoading && !displayData && !liveError;
  
  if (!hasDeviceId) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Vehicle not found</p>
            <Button variant="outline" onClick={() => navigate("/owner/vehicles")}>
              Back to Vehicles
            </Button>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  if (hasCriticalError) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-4">
            <p className="text-destructive font-medium mb-2">Failed to load vehicle data</p>
            <p className="text-sm text-muted-foreground mb-4">
              {liveError instanceof Error ? liveError.message : "An unexpected error occurred"}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleRefresh}>Retry</Button>
              <Button variant="outline" onClick={() => navigate("/owner/vehicles")}>
                Back to Vehicles
              </Button>
            </div>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  if (hasNoData) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-4">
            <p className="text-foreground font-medium mb-2">No vehicle data available</p>
            <Button onClick={handleRefresh}>Refresh</Button>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  if (isInitialLoading) {
    return (
      <OwnerLayout>
        <div className="flex flex-col h-full">
          <div className="px-4 py-6 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout>
      <PullToRefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
      />

      <div {...pullHandlers} className="flex flex-col min-h-full w-full max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <ProfileHeader
          displayName={displayName}
          avatarUrl={avatarUrl}
          personalityMode={personalityMode}
          status={status}
          lastGpsFix={displayData?.lastGpsFix ?? null}
          lastSyncedAt={displayData?.lastSyncedAt ?? null}
          onBack={() => navigate("/owner/vehicles")}
          onSettings={() => setSettingsOpen(true)}
          plateNumber={plateNumber}
        />

        {/* Main Content */}
        <div className="flex-1 pb-32 space-y-4">
            {/* Map Section */}
            <VehicleMapSection
              latitude={displayData?.latitude ?? null}
              longitude={displayData?.longitude ?? null}
              heading={displayData?.heading ?? null}
              speed={displayData?.speed ?? 0}
              address={address}
              vehicleName={displayName}
              isOnline={status === "online" || status === "charging"}
              // Don't block map rendering if we already have fallback coordinates (ownerVehicles/DB).
              isLoading={isInitialLoading}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              routeCoords={routeCoords}
              routeStartEnd={routeCoords && routeCoords.length > 1 ? {
                start: routeCoords[0],
                end: routeCoords[routeCoords.length - 1]
              } : undefined}
              geofences={geofenceOverlays}
            />

            {/* Current Status */}
            <CurrentStatusCard 
              status={status} 
              speed={displayData?.speed ?? null} 
              lastUpdate={displayData?.lastUpdate ?? null}
            />

            {/* Status Metrics */}
            <StatusMetricsRow
              battery={displayData?.batteryPercent ?? null}
              totalMileage={displayData?.totalMileageKm ?? null}
            />

            {/* Engine Control */}
            <div className="grid grid-cols-1 gap-4">
              <EngineControlCard
                deviceId={resolvedDeviceId}
                ignitionOn={displayData?.ignitionOn ?? null}
                isOnline={status === "online" || status === "charging"}
              />
            </div>

            {/* Reports & Trips */}
            <ReportsSection
              deviceId={resolvedDeviceId}
              trips={trips}
              events={events}
              dailyStats={dailyStats}
              tripsLoading={tripsLoading}
              eventsLoading={eventsLoading}
              statsLoading={statsLoading}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onRequestTrips={handleRequestTrips}
              syncStatus={syncStatus}
              isSyncing={isSyncing}
              onForceSync={handleForceSync}
              onPlayTrip={(trip) => {
                const startValid =
                  !!trip.start_time &&
                  trip.start_latitude != null &&
                  trip.start_longitude != null &&
                  trip.start_latitude !== 0 &&
                  trip.start_longitude !== 0;
                const endValid =
                  !!trip.end_time &&
                  trip.end_latitude != null &&
                  trip.end_longitude != null &&
                  trip.end_latitude !== 0 &&
                  trip.end_longitude !== 0;
                if (!startValid || !endValid) {
                  toast.warning("Playback unavailable", { description: "Trip has incomplete GPS data" });
                  return;
                }
                (async () => {
                  try {
                    const { data, error } = await (supabase as any)
                      .from('position_history')
                      .select('latitude, longitude, gps_time')
                      .eq('device_id', resolvedDeviceId)
                      .gte('gps_time', trip.start_time)
                      .lte('gps_time', trip.end_time)
                      .order('gps_time', { ascending: true })
                      .limit(5000);
                    if (error) throw error;
                    const coords = (data as any[])
                      .filter(p => p.latitude && p.longitude && p.latitude !== 0 && p.longitude !== 0)
                      .map(p => ({ lat: Number(p.latitude), lon: Number(p.longitude) }));
                    if (coords.length >= 2) {
                      setRouteCoords(coords);
                      toast.info("Trip playback", { description: `Showing path with ${coords.length} points` });
                    } else {
                      setRouteCoords([
                        { lat: trip.start_latitude as number, lon: trip.start_longitude as number },
                        { lat: trip.end_latitude as number, lon: trip.end_longitude as number }
                      ]);
                      toast.info("Trip playback", { description: "Showing start–end route" });
                    }
                  } catch (e: any) {
                    toast.error("Failed to load path", { description: e?.message || "Error fetching trip points" });
                  }
                })();
              }}
              isRealtimeActive={status === 'online'}
            />
        </div>
      </div>

      {/* Vehicle Settings Dialog */}
      <Dialog 
        open={settingsOpen} 
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) refetchProfile();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vehicle Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure vehicle persona settings
            </DialogDescription>
          </DialogHeader>
          <VehiclePersonaSettings 
            deviceId={resolvedDeviceId} 
            vehicleName={displayName}
          />
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
