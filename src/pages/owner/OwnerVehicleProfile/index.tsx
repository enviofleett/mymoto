import { useState, useCallback, useMemo, useEffect } from "react";
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
import { useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";
import {
  useVehicleTrips,
  useVehicleEvents,
  useVehicleLLMSettings,
  useVehicleDailyStats,
  VehicleTrip,
} from "@/hooks/useVehicleProfile";
import {
  useTripSyncStatus,
  useTriggerTripSync,
  useRealtimeTripUpdates,
} from "@/hooks/useTripSync";
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
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

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
      ? { dateRange: { from: dateRange.from, to: dateRange.to ?? dateRange.from } }
      : { limit: 200 }, // Increased from 50 to 200 to ensure we get all recent trips
    true
  );

  // DEBUG: Log trips when they change
  if (process.env.NODE_ENV === 'development') {
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

  // CRITICAL FIX #2: Complete status derivation with charging detection
  const isOnline = liveData?.isOnline ?? false;
  const status: "online" | "charging" | "offline" = useMemo(() => {
    if (!liveData?.isOnline) {
      return "offline";
    }
    
    // Detect charging: vehicle is online, ignition is off, and battery is present
    // This is a heuristic - adjust based on your actual charging detection logic
    const isCharging = 
      liveData.batteryPercent !== null && 
      liveData.ignitionOn === false && 
      liveData.speed === 0;
    
    return isCharging ? "charging" : "online";
  }, [liveData?.isOnline, liveData?.batteryPercent, liveData?.ignitionOn, liveData?.speed]);

  // AUTO-SYNC ON PAGE LOAD - Ensures fresh trip data without manual sync
  useEffect(() => {
    if (!deviceId) return;

    const autoSyncOnMount = async () => {
      console.log('[VehicleProfile] Auto-syncing trips on page load');
      setIsAutoSyncing(true);

      try {
        // Trigger incremental sync in background (non-blocking)
        // This runs silently and updates the UI when complete
        supabase.functions.invoke("sync-trips-incremental", {
          body: {
            device_ids: [deviceId],
            force_full_sync: false  // Quick incremental sync only
          },
        }).then(result => {
          console.log('[VehicleProfile] Auto-sync completed:', result);

          // Invalidate trips query to trigger refetch with fresh data
          queryClient.invalidateQueries({
            queryKey: ["vehicle-trips", deviceId],
            exact: false // Invalidate all variants
          });

          // Also invalidate daily stats for mileage consistency
          queryClient.invalidateQueries({
            queryKey: ["vehicle-daily-stats", deviceId],
            exact: false
          });

          setIsAutoSyncing(false);
        }).catch(error => {
          console.warn('[VehicleProfile] Auto-sync failed (non-critical):', error);
          setIsAutoSyncing(false);
          // Don't show error to user - background operation failure is non-critical
          // Cached data is still shown
        });

      } catch (error) {
        console.warn('[VehicleProfile] Auto-sync error:', error);
        setIsAutoSyncing(false);
      }
    };

    // Small delay to let page render first (better UX)
    const timer = setTimeout(autoSyncOnMount, 500);

    return () => clearTimeout(timer);
  }, [deviceId, queryClient]); // Only run on mount or when deviceId changes

  // CRITICAL FIX: All hooks must be called BEFORE any conditional returns
  // Force sync handler - processes last 7 days with full sync
  const handleForceSync = useCallback(() => {
    if (!deviceId) return;
    triggerSync({ deviceId, forceFullSync: true });
  }, [deviceId, triggerSync]);

  // HIGH PRIORITY FIX #4: Pull to refresh handler with proper error handling and sync coordination
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;

    setIsRefreshing(true);
    
    try {
      // Trigger incremental trip sync and wait briefly for it to start
      // We don't wait for full completion to keep UI responsive, but we give it a moment
      const syncPromise = supabase.functions.invoke("sync-trips-incremental", {
        body: { device_ids: [deviceId], force_full_sync: false },
      });

      // Invalidate all cached queries for this device (especially trips to get latest data)
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            (key[0] === "vehicle-live-data" ||
              key[0] === "vehicle-trips" ||
              key[0] === "vehicle-events" ||
              key[0] === "mileage-stats" ||
              key[0] === "daily-mileage" ||
              key[0] === "vehicle-daily-stats" ||
              key[0] === "vehicle-info" ||
              key[0] === "vehicle-llm-settings" ||
              key[0] === "trip-sync-status" ||
              key[0] === "driver-score") &&
            key[1] === deviceId
          );
        },
      });
      
      // Explicitly invalidate trips query to force fresh fetch
      queryClient.invalidateQueries({ 
        queryKey: ["vehicle-trips", deviceId],
        exact: false // Invalidate all trip queries for this device
      });
      
      // Also remove cached trips data to force a fresh fetch
      queryClient.removeQueries({
        queryKey: ["vehicle-trips", deviceId],
        exact: false
      });
      
      // Force a fresh refetch after clearing cache
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refetch all queries in parallel
      const refetchResults = await Promise.allSettled([
        refetchProfile(),
        refetchLive(),
        refetchTrips(),
        refetchEvents(),
        refetchDailyStats(),
      ]);

      // Check for any failures
      const failures = refetchResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        // Log errors but don't fail the entire refresh
        if (process.env.NODE_ENV === 'development') {
          console.warn('Some data failed to refresh:', failures);
        }
      }

      // Wait for sync to complete (with timeout to prevent hanging)
      try {
        await Promise.race([
          syncPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sync timeout')), 10000)
          ),
        ]);
      } catch (syncError) {
        // Sync errors are non-critical - data will sync eventually
        if (process.env.NODE_ENV === 'development') {
          console.warn('Background sync warning:', syncError);
        }
      }
    } catch (error) {
      // Show user-friendly error message
      toast.error("Failed to refresh some data", {
        description: "Some information may be outdated. Please try again.",
      });
      
      if (process.env.NODE_ENV === 'development') {
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
    refetchDailyStats,
  ]);

  // Pull-to-refresh setup
  const { pullDistance, isPulling, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

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
              totalMileage={liveData?.totalMileageKm ?? null}
              dailyStats={dailyStats}
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
              isSyncing={isSyncing || isAutoSyncing || syncStatus?.sync_status === "processing"}
              isAutoSyncing={isAutoSyncing}
              onForceSync={handleForceSync}
              isRealtimeActive={isSubscribed}
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
