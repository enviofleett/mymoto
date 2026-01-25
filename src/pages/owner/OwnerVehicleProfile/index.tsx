import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TripPlaybackDialog } from "@/components/profile/TripPlaybackDialog";
import { VehiclePersonaSettings } from "@/components/fleet/VehiclePersonaSettings";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useVehicleLiveData, useVehicleLiveDataHeartbeat } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";
import {
  useVehicleTrips,
  useVehicleEvents,
  useVehicleLLMSettings,
  useMileageStats,
  useDailyMileage,
  useVehicleDailyStats,
  VehicleTrip,
} from "@/hooks/useVehicleProfile";
import {
  useTripSyncStatus,
  useTriggerTripSync,
  useRealtimeTripUpdates,
} from "@/hooks/useTripSync";
import { useRealtimeVehicleUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { supabase } from "@/integrations/supabase/client";

// Import sub-components
import { ProfileHeader } from "./components/ProfileHeader";
import { VehicleMapSection } from "./components/VehicleMapSection";
import { CurrentStatusCard } from "./components/CurrentStatusCard";
import { StatusMetricsRow } from "./components/StatusMetricsRow";
import { EngineControlCard } from "./components/EngineControlCard";
import { MileageSection } from "./components/MileageSection";
import { ReportsSection } from "./components/ReportsSection";

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // CRITICAL FIX #1: Check deviceId BEFORE initializing hooks
  if (!deviceId) {
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

  // Data hooks - now safe to use deviceId
  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
    refetch: refetchLive,
  } = useVehicleLiveData(deviceId);

  // Phase 2: realtime is gated by feature flag + device allowlist
  // (default OFF -> no behavior change until enabled)
  useRealtimeVehicleUpdates(deviceId, { forceEnable: true });
  useVehicleLiveDataHeartbeat(deviceId);

  const { 
    data: llmSettings, 
    error: llmError,
    refetch: refetchProfile 
  } = useVehicleLLMSettings(deviceId, true);

  const {
    data: trips,
    isLoading: tripsLoading,
    error: tripsError,
    refetch: refetchTrips,
  } = useVehicleTrips(
    deviceId,
    dateRange?.from
      ? { dateRange: { from: dateRange.from, to: dateRange.to ?? dateRange.from }, live: true }
      : { limit: 200, live: true },
    true
  );
  
  // DEBUG: Log trips when they change (development only)
  if (import.meta.env.DEV) {
    console.log('[OwnerVehicleProfile] Trips data:', {
      count: trips?.length || 0,
      loading: tripsLoading,
      error: tripsError,
      hasDateRange: !!dateRange?.from
    });
    
    if (trips && trips.length > 0) {
      const tripDates = trips.map(t => t.start_time.split('T')[0]);
      const uniqueDates = [...new Set(tripDates)];
      console.log('[OwnerVehicleProfile] Unique trip dates:', uniqueDates.sort().reverse());
    }
  }

  const {
    data: events,
    isLoading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useVehicleEvents(
    deviceId,
    dateRange?.from
      ? { dateRange: { from: dateRange.from, to: dateRange.to ?? dateRange.from } }
      : { limit: 50 },
    true
  );

  const { 
    data: mileageStats, 
    error: mileageError,
    refetch: refetchMileage 
  } = useMileageStats(deviceId, true);
  
  const { 
    data: dailyMileage, 
    error: dailyMileageError,
    refetch: refetchDaily 
  } = useDailyMileage(deviceId, true);
  
  const { 
    data: dailyStats, 
    error: dailyStatsError,
    refetch: refetchDailyStats 
  } = useVehicleDailyStats(deviceId, 30, true);

  // Trip sync management
  const { data: syncStatus } = useTripSyncStatus(deviceId, true);
  const { mutate: triggerSync, isPending: isSyncing } = useTriggerTripSync();
  const { isSubscribed } = useRealtimeTripUpdates(deviceId, true);

  // Address lookup
  const { address, isLoading: addressLoading } = useAddress(
    liveData?.latitude ?? null,
    liveData?.longitude ?? null
  );

  // Status derivation: online, charging, or offline
  const isOnline = liveData?.isOnline ?? false;
  const status: "online" | "charging" | "offline" = useMemo(() => {
    if (!liveData?.isOnline) {
      return "offline";
    }
    
    // Detect charging/parked state: vehicle is online, ignition is off, and stationary
    // This is an inferred status based on vehicle state
    const isParked = 
      liveData.ignitionOn === false && 
      liveData.speed === 0;
    
    // Show as "charging" if:
    // 1. Vehicle is parked (ignition off, speed 0)
    // 2. Battery data is available (indicates battery monitoring capability)
    // Note: This is inferred - actual charging state may vary by vehicle type
    const hasBatteryData = liveData.batteryPercent !== null;
    const isCharging = isParked && hasBatteryData;
    
    return isCharging ? "charging" : "online";
  }, [liveData?.isOnline, liveData?.batteryPercent, liveData?.ignitionOn, liveData?.speed]);

  // CRITICAL FIX: All hooks must be called BEFORE any conditional returns
  // Force sync handler - processes last 7 days with full sync
  const handleForceSync = useCallback(() => {
    if (!deviceId) return;
    triggerSync({ deviceId, forceFullSync: true });
  }, [deviceId, triggerSync]);

  // Optimized pull-to-refresh: Show DB data instantly, sync in background
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;

    setIsRefreshing(true);
    
    try {
      // Step 1: Immediately refetch from DB (instant response)
      const refetchResults = await Promise.allSettled([
        refetchProfile(),
        refetchLive(),
        refetchTrips(),  // Shows existing trips immediately
        refetchEvents(),
        refetchMileage(),
        refetchDaily(),
        refetchDailyStats(),
      ]);

      // Check for any failures
      const failures = refetchResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        if (import.meta.env.DEV) {
          console.warn('Some data failed to refresh:', failures);
        }
      }

      // Step 2: Trigger background sync (don't wait - fire-and-forget)
      supabase.functions.invoke("sync-trips-incremental", {
        body: { device_ids: [deviceId], force_full_sync: false },
      }).catch((error) => {
        // Log but don't block UI
        console.warn('Background sync error:', error);
      });

      // Step 3: Show success immediately
      toast.success("Refreshed", { 
        description: "Syncing new data in background..." 
      });
    } catch (error) {
      toast.error("Failed to refresh", { 
        description: error instanceof Error ? error.message : "Unknown error" 
      });
      
      if (import.meta.env.DEV) {
        console.error('Refresh error:', error);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [
    deviceId,
    queryClient,
    refetchProfile,
    refetchLive,
    refetchTrips,
    refetchEvents,
    refetchMileage,
    refetchDaily,
    refetchDailyStats,
  ]);

  // Pull-to-refresh setup
  const { pullDistance, isPulling, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Auto-sync on page load (CRITICAL FIX #4: Auto-sync implementation)
  const hasAutoSyncedRef = useRef(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  
  useEffect(() => {
    // Only auto-sync once per mount, and only if deviceId exists
    if (!deviceId || hasAutoSyncedRef.current) return;
    
    // Mark as synced immediately to prevent duplicate calls
    hasAutoSyncedRef.current = true;
    
    // Small delay to ensure page is fully loaded before syncing
    const timeoutId = setTimeout(() => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[VehicleProfile] Auto-syncing trips on page load');
      }
      
      setIsAutoSyncing(true);
      
      // Trigger incremental sync (not full sync) to get latest trips
      // Use mutate with callbacks to handle auto-sync state
      triggerSync(
        { deviceId, forceFullSync: false },
        {
          onSuccess: () => {
            setIsAutoSyncing(false);
            if (import.meta.env.DEV) {
              console.log('[VehicleProfile] Auto-sync completed successfully');
            }
            // Invalidate queries to refresh data after sync
            queryClient.invalidateQueries({ queryKey: ["vehicle-trips", deviceId] });
            queryClient.invalidateQueries({ queryKey: ["vehicle-daily-stats", deviceId] });
          },
          onError: (error) => {
            setIsAutoSyncing(false);
            // Don't show error toast for auto-sync failures (silent failure)
            if (import.meta.env.DEV) {
              console.warn('[VehicleProfile] Auto-sync failed:', error);
            }
          },
        }
      );
    }, 500); // 500ms delay to let page render first
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [deviceId, triggerSync, queryClient]);

  // Display values with safe fallbacks
  const displayName = llmSettings?.nickname || deviceId;
  const vehicleName = deviceId;
  const avatarUrl = llmSettings?.avatar_url || null;
  const personalityMode = llmSettings?.personality_mode || null;

  // CRITICAL FIX #3: Unified loading and error states - NOW AFTER ALL HOOKS
  const isInitialLoading = liveLoading && !liveData;
  const hasCriticalError = liveError !== null && liveError !== undefined;
  const hasNoData = !liveLoading && !liveData && !liveError;
  
  // Show error state for critical data failures
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
              <Button onClick={() => refetchLive()}>Retry</Button>
              <Button variant="outline" onClick={() => navigate("/owner/vehicles")}>
                Back to Vehicles
              </Button>
            </div>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  // Show message when no data exists (vehicle not in database)
  if (hasNoData) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-4">
            <p className="text-foreground font-medium mb-2">No vehicle data available</p>
            <p className="text-sm text-muted-foreground mb-4">
              This vehicle hasn't been synced yet or doesn't exist in the system.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => refetchLive()}>Refresh</Button>
              <Button variant="outline" onClick={() => navigate("/owner/vehicles")}>
                Back to Vehicles
              </Button>
            </div>
          </div>
        </div>
      </OwnerLayout>
    );
  }

  // Show loading skeleton during initial load
  if (isInitialLoading) {
    return (
      <OwnerLayout>
        <div className="flex flex-col h-full">
          <div className="px-4 py-6 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </OwnerLayout>
    );
  }

  return (
    <OwnerLayout>
      <PullToRefresh
        isPulling={isPulling}
        pullProgress={pullDistance / 80}
        isRefreshing={isRefreshing}
      />

      <div {...pullHandlers} className="flex flex-col min-h-full overflow-y-auto">
        {/* Header */}
        <ProfileHeader
          displayName={displayName}
          vehicleName={vehicleName}
          avatarUrl={avatarUrl}
          personalityMode={personalityMode}
          status={status}
          lastUpdate={liveData?.lastUpdate ?? null}
          lastGpsFix={liveData?.lastGpsFix ?? null}
          lastSyncedAt={liveData?.lastSyncedAt ?? null}
          onBack={() => navigate("/owner/vehicles")}
          onSettings={() => setSettingsOpen(true)}
        />

        {/* Main Content */}
        <ScrollArea className="flex-1">
          <div className="px-4 pb-8 space-y-4">
            {/* Map Section */}
            <VehicleMapSection
              latitude={liveData?.latitude ?? null}
              longitude={liveData?.longitude ?? null}
              heading={liveData?.heading ?? null}
              speed={liveData?.speed ?? 0}
              address={address}
              vehicleName={displayName}
              isOnline={isOnline}
              isLoading={liveLoading || addressLoading}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
            />

            {/* Current Status */}
            <CurrentStatusCard status={status} speed={liveData?.speed ?? null} />

            {/* Status Metrics */}
            <StatusMetricsRow
              battery={liveData?.batteryPercent ?? null}
              totalMileage={liveData?.totalMileageKm ?? null}
            />

            {/* Engine Control */}
            <div className="grid grid-cols-1 gap-4">
              <EngineControlCard
                deviceId={deviceId}
                ignitionOn={liveData?.ignitionOn ?? null}
                isOnline={isOnline}
              />
            </div>

            {/* Mileage Section */}
            <MileageSection
              deviceId={deviceId}
              totalMileage={liveData?.totalMileageKm ?? null}
              dailyStats={dailyStats}
              mileageStats={mileageStats}
              dailyMileage={dailyMileage}
              dateRange={dateRange}
            />

            {/* Reports Section */}
            <ReportsSection
              deviceId={deviceId}
              trips={trips}
              events={events}
              tripsLoading={tripsLoading}
              eventsLoading={eventsLoading}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onPlayTrip={setSelectedTrip}
              syncStatus={syncStatus}
              isSyncing={isSyncing || syncStatus?.sync_status === "processing" || isAutoSyncing}
              onForceSync={handleForceSync}
              isRealtimeActive={isSubscribed}
              isAutoSyncing={isAutoSyncing}
            />
          </div>
        </ScrollArea>
      </div>

      {/* Trip Playback Dialog */}
      {selectedTrip && (
        <TripPlaybackDialog
          open={!!selectedTrip}
          onOpenChange={(open) => !open && setSelectedTrip(null)}
          deviceId={deviceId}
          deviceName={displayName}
          startTime={selectedTrip.start_time}
          endTime={selectedTrip.end_time}
        />
      )}

      {/* Vehicle Settings Dialog */}
      <Dialog 
        open={settingsOpen} 
        onOpenChange={(open) => {
          setSettingsOpen(open);
          // Refetch profile data when dialog closes to get updated settings
          if (!open) {
            refetchProfile();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="vehicle-settings-description">
          <DialogHeader>
            <DialogTitle>Vehicle Settings</DialogTitle>
          </DialogHeader>
          <p id="vehicle-settings-description" className="sr-only">
            Configure vehicle persona settings including nickname, language preference, personality mode, and avatar
          </p>
          <VehiclePersonaSettings 
            deviceId={deviceId} 
            vehicleName={displayName}
          />
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
