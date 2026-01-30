import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { PullToRefresh, PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";

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

  // ============================================================================
  // RECONNECTED: All data hooks enabled - ready to receive data from backend
  // ============================================================================

  // Live vehicle data hook - reconnected
  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
    refetch: refetchLive,
  } = useVehicleLiveData(deviceId);

  // Auto-refresh stale data on mount/update to ensure 100% LIVE data
  const lastAutoSyncRef = useRef<number>(0);
  useEffect(() => {
    if (!liveData?.lastUpdate || !deviceId) return;
    
    const now = Date.now();
    const lastUpdate = liveData.lastUpdate.getTime();
    const ageSeconds = (now - lastUpdate) / 1000;
    
    // If data is stale (> 60s) and we haven't auto-synced in the last 60s
    if (ageSeconds > 60 && (now - lastAutoSyncRef.current > 60000)) {
      if (import.meta.env.DEV) {
        console.log(`[OwnerVehicleProfile] Data is stale (${Math.round(ageSeconds)}s), triggering auto-refresh...`);
      }
      lastAutoSyncRef.current = now;
      
      supabase.functions.invoke("gps-data", {
        body: { 
          action: "lastposition", 
          body_payload: { deviceids: [deviceId] },
          use_cache: false 
        },
      }).then(() => {
         if (import.meta.env.DEV) console.log('[OwnerVehicleProfile] Auto-refresh sync initiated');
      }).catch(err => console.error("Auto-refresh failed:", err));
    }
  }, [deviceId, liveData?.lastUpdate]);

  // DEBUG: Track liveData changes and data freshness
  useEffect(() => {
    if (liveData && import.meta.env.DEV) {
      const now = new Date();
      const lastUpdateAge = liveData.lastUpdate ? Math.round((now.getTime() - liveData.lastUpdate.getTime()) / 1000) : null;
      const lastGpsFixAge = liveData.lastGpsFix ? Math.round((now.getTime() - liveData.lastGpsFix.getTime()) / 1000) : null;
      const lastSyncedAge = liveData.lastSyncedAt ? Math.round((now.getTime() - liveData.lastSyncedAt.getTime()) / 1000) : null;
      
      console.log('[OwnerVehicleProfile] 📍 liveData changed:', {
        latitude: liveData.latitude,
        longitude: liveData.longitude,
        speed: liveData.speed,
        heading: liveData.heading,
        lastUpdate: liveData.lastUpdate?.toISOString(),
        lastUpdateAgeSeconds: lastUpdateAge,
        lastGpsFix: liveData.lastGpsFix?.toISOString(),
        lastGpsFixAgeSeconds: lastGpsFixAge,
        lastSyncedAt: liveData.lastSyncedAt?.toISOString(),
        lastSyncedAgeSeconds: lastSyncedAge,
        currentTime: now.toISOString(),
        isStale: lastUpdateAge !== null && lastUpdateAge > 60, // Consider stale if > 60 seconds old
      });
      
      // Warn if data is stale
      if (lastUpdateAge !== null && lastUpdateAge > 60) {
        console.warn(`[OwnerVehicleProfile] ⚠️ STALE DATA: Last update is ${lastUpdateAge} seconds old (${Math.round(lastUpdateAge / 60)} minutes)`);
      }
    }
  }, [liveData?.latitude, liveData?.longitude, liveData?.speed, liveData?.heading, liveData?.lastUpdate, liveData?.lastGpsFix, liveData?.lastSyncedAt]);

  // Realtime subscriptions - reconnected
  const realtimeOptions = useMemo(() => ({ forceEnable: true }), []);
  useRealtimeVehicleUpdates(deviceId, realtimeOptions);
  useVehicleLiveDataHeartbeat(deviceId);

  // Vehicle LLM settings - reconnected
  const { 
    data: llmSettings, 
    error: llmError, 
    refetch: refetchProfile 
  } = useVehicleLLMSettings(deviceId, true);

  // Vehicle trips - reconnected
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
  useEffect(() => {
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
  }, [trips, tripsLoading, tripsError, dateRange]);

  // Vehicle events - reconnected
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

  // Mileage stats - reconnected
  const { 
    data: mileageStats, 
    error: mileageError, 
    refetch: refetchMileage 
  } = useMileageStats(deviceId, true);
  
  // Daily mileage - reconnected
  const { 
    data: dailyMileage, 
    error: dailyMileageError, 
    refetch: refetchDaily 
  } = useDailyMileage(deviceId, true);
  
  // Daily stats - reconnected
  const { 
    data: dailyStats, 
    error: dailyStatsError, 
    refetch: refetchDailyStats 
  } = useVehicleDailyStats(deviceId, 30, true);

  // Trip sync management - reconnected
  const { data: syncStatus } = useTripSyncStatus(deviceId, true);
  const { mutate: triggerSync, isPending: isSyncing } = useTriggerTripSync();
  const { isSubscribed } = useRealtimeTripUpdates(deviceId, true);

  // Address lookup - reconnected
  const { address, isLoading: addressLoading } = useAddress(
    liveData?.latitude ?? null,
    liveData?.longitude ?? null
  );

  // Status derivation: online, charging, or offline - reconnected
  const isOnline = liveData?.isOnline ?? false;
  const status: "online" | "charging" | "offline" = useMemo(() => {
    if (!liveData?.isOnline) {
      return "offline";
    }
    
    // Detect charging/parked state: vehicle is online, ignition is off, and stationary
    const isParked = 
      liveData.ignitionOn === false && 
      liveData.speed === 0;
    
    // Show as "charging" if parked and has battery data
    const hasBatteryData = liveData.batteryPercent !== null;
    const isCharging = isParked && hasBatteryData;
    
    return isCharging ? "charging" : "online";
  }, [liveData?.isOnline, liveData?.batteryPercent, liveData?.ignitionOn, liveData?.speed]);

  // Force sync handler - reconnected
  const handleForceSync = useCallback(() => {
    if (!deviceId) return;
    triggerSync({ deviceId, forceFullSync: true });
  }, [deviceId, triggerSync]);

  // Pull-to-refresh handler - SAFE: Uses rate-limited functions, non-blocking
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;

    setIsRefreshing(true);
    
    try {
      // Step 1: Immediately refetch from DB (instant response - no API calls)
      // This shows existing data instantly while sync happens in background
      const refetchResults = await Promise.allSettled([
        refetchProfile(),
        refetchLive(),
        refetchTrips(),
        refetchEvents(),
        refetchMileage(),
        refetchDaily(),
        refetchDailyStats(),
      ]);

      // Check for any failures
      const failures = refetchResults.filter(r => r.status === 'rejected');
      if (failures.length > 0 && import.meta.env.DEV) {
        console.warn('[handleRefresh] Some data failed to refresh:', failures);
      }

      // Step 2: Trigger GPS data sync in background (SAFE: uses rate-limited client)
      // This updates vehicle_positions table with fresh GPS data
      if (import.meta.env.DEV) {
        console.log('[handleRefresh] 🔄 Triggering GPS data sync (rate-limited, safe)...');
      }
      
      supabase.functions.invoke("gps-data", {
        body: { 
          action: "lastposition", 
          body_payload: { deviceids: [deviceId] }, // Target specific device for faster sync
          use_cache: false 
        }, 
      }).then(() => {
        // After GPS sync completes, refetch live data to get fresh GPS coordinates
        setTimeout(() => {
          refetchLive();
          if (import.meta.env.DEV) {
            console.log('[handleRefresh] ✅ GPS sync completed, refetched live data');
          }
        }, 3000); // Wait 3 seconds for GPS sync to complete
      }).catch((error) => {
        // Non-critical: GPS sync failure doesn't break UI
        console.warn('[handleRefresh] GPS sync error (non-critical):', error);
        // Still refetch live data in case there's cached data
        setTimeout(() => refetchLive(), 500);
      });

      // Step 3: Trigger trip sync in background (SAFE: uses rate-limited client)
      // Don't wait - fire-and-forget
      supabase.functions.invoke("sync-trips-incremental", {
        body: { device_ids: [deviceId], force_full_sync: false },
      }).catch((error) => {
        // Non-critical: Trip sync failure doesn't break UI
        if (import.meta.env.DEV) {
          console.warn('[handleRefresh] Background trip sync error (non-critical):', error);
        }
      });

      // Step 4: Show success immediately (data is refreshing in background)
      toast.success("Refreshing...", { 
        description: "Syncing fresh data in background..." 
      });
    } catch (error) {
      toast.error("Failed to refresh", { 
        description: error instanceof Error ? error.message : "Unknown error" 
      });
      
      if (import.meta.env.DEV) {
        console.error('[handleRefresh] Error:', error);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [
    deviceId,
    refetchProfile,
    refetchLive,
    refetchTrips,
    refetchEvents,
    refetchMileage,
    refetchDaily,
    refetchDailyStats,
  ]);

  // Pull-to-refresh setup - reconnected
  const { pullDistance, isPulling, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Auto-sync on page load - reconnected
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

  // Display values with safe fallbacks - reconnected
  const { data: ownerVehicles } = useOwnerVehicles();
  const vehicle = ownerVehicles?.find((v) => v.deviceId === deviceId);

  const displayName = llmSettings?.nickname || vehicle?.plateNumber || deviceId;
  const plateNumber = vehicle?.plateNumber || deviceId;
  const vehicleName = deviceId; // Re-introduce vehicleName as deviceId
  const avatarUrl = llmSettings?.avatar_url || null;
  const personalityMode = llmSettings?.personality_mode || null;

  // Loading and error states - reconnected
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
      <PullToRefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
      />

      <div {...pullHandlers} className="flex flex-col min-h-full w-full max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <ProfileHeader
          displayName={displayName}
          vehicleName={vehicleName}
          avatarUrl={avatarUrl}
          personalityMode={personalityMode}
          status={status}
          lastGpsFix={liveData?.lastGpsFix ?? null}
          lastSyncedAt={liveData?.lastSyncedAt ?? null}
          onBack={() => navigate("/owner/vehicles")}
              onSettings={() => setSettingsOpen(true)}
          plateNumber={plateNumber}
        />

        {/* Main Content */}
        <div className="flex-1 pb-32 space-y-4">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vehicle Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Configure vehicle persona settings including nickname, language preference, personality mode, and avatar
            </DialogDescription>
          </DialogHeader>
          <VehiclePersonaSettings 
            deviceId={deviceId} 
            vehicleName={displayName}
          />
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
