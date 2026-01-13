import { useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { VehiclePersonaSettings } from "@/components/fleet/VehiclePersonaSettings";
import { DriverScoreCard } from "@/components/fleet/DriverScoreCard";
import { TripPlaybackDialog } from "@/components/profile/TripPlaybackDialog";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { useAddress } from "@/hooks/useAddress";
import { useVehicleProfileData } from "@/hooks/useVehicleProfileData";
import { useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import {
  useVehicleTrips,
  useVehicleEvents,
  useMileageStats,
  useDailyMileage,
  useVehicleDailyStats,
  type VehicleTrip,
  type TripFilterOptions,
  type EventFilterOptions,
} from "@/hooks/useVehicleProfile";

// Import modular components
import { ProfileHeader } from "./components/ProfileHeader";
import { VehicleMapSection } from "./components/VehicleMapSection";
import { EngineControlCard } from "./components/EngineControlCard";
import { DoorControlCard } from "./components/DoorControlCard";
import { StatusMetricsRow } from "./components/StatusMetricsRow";
import { CurrentStatusCard } from "./components/CurrentStatusCard";
import { ReportsSection } from "./components/ReportsSection";
import { MileageSection } from "./components/MileageSection";

import type { DateRange } from "react-day-picker";

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);
  const [showTripPlayback, setShowTripPlayback] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Build filter options based on date range
  const filterOptions: TripFilterOptions & EventFilterOptions = useMemo(() => ({
    dateRange: dateRange?.from ? {
      from: dateRange.from,
      to: dateRange.to,
    } : undefined,
    limit: 100,
  }), [dateRange]);
  
  // FLEET-SCALE SAFE: Metadata from useVehicleProfileData
  const {
    vehicle,
    llmSettings,
    displayName,
    isLoading: metadataLoading,
    refetch: refetchProfile,
  } = useVehicleProfileData(deviceId ?? null);
  
  // FLEET-SCALE SAFE: Live GPS data from database (not Edge Function)
  const {
    data: liveData,
    isLoading: liveLoading,
    refetch: refetchLive,
  } = useVehicleLiveData(deviceId ?? null);
  
  // Derive status from live data
  const isOnline = liveData?.isOnline ?? false;
  const status: 'online' | 'charging' | 'offline' = isOnline ? 'online' : 'offline';
  const lastUpdate = liveData?.lastUpdate ?? null;
  
  // Secondary data hooks
  const { data: trips, isLoading: tripsLoading, refetch: refetchTrips } = useVehicleTrips(deviceId ?? null, filterOptions);
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useVehicleEvents(deviceId ?? null, filterOptions);
  const { data: mileageStats, refetch: refetchMileage } = useMileageStats(deviceId ?? null);
  const { data: dailyMileage, refetch: refetchDaily } = useDailyMileage(deviceId ?? null);
  
  // Get filter days for daily stats
  const filterDays = dateRange?.from && dateRange?.to 
    ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 30;
  const { data: dailyStats, refetch: refetchDailyStats } = useVehicleDailyStats(deviceId ?? null, filterDays);
  
  // Reverse geocoding for current location
  const { address: currentAddress } = useAddress(
    liveData?.latitude,
    liveData?.longitude
  );
  
  /**
   * CRITICAL: Pull-to-refresh handler that guarantees fresh data.
   * 
   * Strategy: Invalidate queries FIRST (marks as stale), THEN refetch.
   * This bypasses staleTime and forces a network request.
   * 
   * "Real-time" Definition:
   * - Manual refresh: User-triggered, always fetches latest from DB
   * - Live updates: useVehicleLiveData polls every 15s, events via WebSocket
   */
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;
    
    console.log('[Pull-to-Refresh] Invalidating all vehicle profile caches...');
    
    // 1. Trigger background trip processing (fire-and-forget)
    supabase.functions.invoke('process-trips', {
      body: { device_ids: [deviceId], lookback_hours: 24 },
    }).catch(err => console.log('Background trip processing:', err));
    
    // 2. INVALIDATE all cached queries for this device
    // This marks them as stale IMMEDIATELY, forcing refetch to hit the network
    await queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey;
        // Invalidate all vehicle-specific queries
        return Array.isArray(key) && (
          key[0] === 'vehicle-live-data' ||
          key[0] === 'vehicle-trips' ||
          key[0] === 'vehicle-events' ||
          key[0] === 'mileage-stats' ||
          key[0] === 'daily-mileage' ||
          key[0] === 'vehicle-daily-stats' ||
          key[0] === 'vehicle-info' ||
          key[0] === 'vehicle-llm-settings' ||
          key[0] === 'driver-score'
        ) && key[1] === deviceId;
      }
    });
    
    console.log('[Pull-to-Refresh] Cache invalidated, refetching all data...');
    
    // 3. Refetch all queries (now guaranteed to hit the network)
    await Promise.all([
      refetchProfile(),
      refetchLive(),
      refetchTrips(),
      refetchEvents(),
      refetchMileage(),
      refetchDaily(),
      refetchDailyStats(),
    ]);
    
    console.log('[Pull-to-Refresh] Complete - all data refreshed from server');
  }, [deviceId, queryClient, refetchProfile, refetchLive, refetchTrips, refetchEvents, refetchMileage, refetchDaily, refetchDailyStats]);
  
  // Pull-to-refresh
  const { pullDistance, isRefreshing: isPullRefreshing, handlers } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });
  
  // Trip playback handler
  const handlePlayTrip = useCallback((trip: VehicleTrip) => {
    setSelectedTrip(trip);
    setShowTripPlayback(true);
  }, []);

  // Loading state - combine metadata and live data loading
  const isLoading = metadataLoading || liveLoading;
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="p-4 safe-area-inset-top">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <div className="flex-1 flex flex-col items-center p-4">
          <Skeleton className="h-32 w-32 rounded-full mb-4" />
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    );
  }

  // Not found state
  if (!vehicle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">Vehicle not found</p>
          <Button variant="link" onClick={() => navigate("/owner/vehicles")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <ProfileHeader
        displayName={displayName}
        vehicleName={vehicle.device_name}
        avatarUrl={llmSettings?.avatar_url ?? null}
        personalityMode={llmSettings?.personality_mode ?? null}
        status={status}
        lastUpdate={lastUpdate}
        onBack={() => navigate(-1)}
        onSettings={() => setIsSettingsOpen(true)}
      />

      {/* Scrollable Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        onTouchStart={handlers.onTouchStart}
        onTouchMove={handlers.onTouchMove}
        onTouchEnd={handlers.onTouchEnd}
      >
        <PullToRefreshIndicator 
          pullDistance={pullDistance} 
          isRefreshing={isPullRefreshing} 
        />
        
        <div className="pb-8 px-4 space-y-4">
          {/* Primary Visual - Large Map */}
          <VehicleMapSection
            latitude={liveData?.latitude ?? null}
            longitude={liveData?.longitude ?? null}
            heading={liveData?.heading ?? null}
            speed={liveData?.speed ?? null}
            address={currentAddress}
            vehicleName={displayName}
            isOnline={isOnline}
            isRefreshing={isPullRefreshing}
            onRefresh={handleRefresh}
          />

          {/* Control Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EngineControlCard
              deviceId={deviceId!}
              ignitionOn={liveData?.ignitionOn ?? null}
              isOnline={isOnline}
            />
            <DoorControlCard
              deviceId={deviceId!}
              isOnline={isOnline}
            />
          </div>

          {/* Status Metrics */}
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Vehicle Status
          </div>
          <StatusMetricsRow
            battery={liveData?.batteryPercent ?? null}
            totalMileage={liveData?.totalMileageKm ?? null}
          />

          {/* Driver Score */}
          {deviceId && (
            <DriverScoreCard deviceId={deviceId} compact />
          )}

          {/* Mileage Section - totalMileage expects meters, convert km back */}
          <MileageSection
            totalMileage={liveData?.totalMileageKm ? liveData.totalMileageKm * 1000 : null}
            dailyStats={dailyStats}
            mileageStats={mileageStats}
            dailyMileage={dailyMileage}
            dateRange={dateRange}
          />

          {/* Reports Section (Trips & Alarms Tabs) */}
          <ReportsSection
            deviceId={deviceId!}
            trips={trips}
            events={events}
            tripsLoading={tripsLoading}
            eventsLoading={eventsLoading}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onPlayTrip={handlePlayTrip}
          />

          {/* Current Status */}
          <CurrentStatusCard
            status={status}
            speed={liveData?.speed ?? null}
          />
        </div>
      </div>

      {/* Trip Playback Dialog */}
      <TripPlaybackDialog
        open={showTripPlayback}
        onOpenChange={setShowTripPlayback}
        deviceId={deviceId || ""}
        deviceName={vehicle.device_name}
        startTime={selectedTrip?.start_time}
        endTime={selectedTrip?.end_time}
      />

      {/* Persona Settings Sheet */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="mb-4">
            <SheetTitle>AI Companion Settings</SheetTitle>
            <SheetDescription>
              Customize how your vehicle's AI companion talks and behaves
            </SheetDescription>
          </SheetHeader>
          <VehiclePersonaSettings 
            deviceId={deviceId || ""} 
            vehicleName={vehicle.device_name} 
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
