import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { TripPlaybackDialog } from "@/components/profile/TripPlaybackDialog";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useVehicleLiveData } from "@/hooks/useVehicleLiveData";
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

  // Data hooks
  const {
    data: liveData,
    isLoading: liveLoading,
    refetch: refetchLive,
  } = useVehicleLiveData(deviceId ?? null);

  const { data: llmSettings, refetch: refetchProfile } = useVehicleLLMSettings(deviceId!, !!deviceId);

  const {
    data: trips,
    isLoading: tripsLoading,
    refetch: refetchTrips,
  } = useVehicleTrips(
    deviceId!,
    dateRange?.from
      ? { dateRange: { from: dateRange.from, to: dateRange.to ?? dateRange.from } }
      : { limit: 50 },
    !!deviceId
  );

  const {
    data: events,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useVehicleEvents(
    deviceId!,
    dateRange?.from
      ? { dateRange: { from: dateRange.from, to: dateRange.to ?? dateRange.from } }
      : { limit: 50 },
    !!deviceId
  );

  const { data: mileageStats, refetch: refetchMileage } = useMileageStats(deviceId!, !!deviceId);
  const { data: dailyMileage, refetch: refetchDaily } = useDailyMileage(deviceId!, !!deviceId);
  const { data: dailyStats, refetch: refetchDailyStats } = useVehicleDailyStats(deviceId!, 30, !!deviceId);

  // Address lookup
  const { address, isLoading: addressLoading } = useAddress(
    liveData?.latitude ?? null,
    liveData?.longitude ?? null
  );

  // Derive status
  const isOnline = liveData?.isOnline ?? false;
  const status: "online" | "charging" | "offline" = liveData?.isOnline
    ? "online"
    : "offline";

  // Pull to refresh handler with cache invalidation
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;

    console.log("[Pull-to-Refresh] Invalidating all vehicle profile caches...");

    // 1. Trigger background trip processing (fire-and-forget)
    supabase.functions
      .invoke("process-trips", {
        body: { device_ids: [deviceId], lookback_hours: 24 },
      })
      .catch((err) => console.log("Background trip processing:", err));

    // 2. Invalidate all cached queries for this device
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
            key[0] === "driver-score") &&
          key[1] === deviceId
        );
      },
    });

    console.log("[Pull-to-Refresh] Cache invalidated, refetching all data...");

    // 3. Refetch all queries
    await Promise.all([
      refetchProfile(),
      refetchLive(),
      refetchTrips(),
      refetchEvents(),
      refetchMileage(),
      refetchDaily(),
      refetchDailyStats(),
    ]);

    console.log("[Pull-to-Refresh] Complete - all data refreshed from server");
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
  const { containerRef, pullProgress, isPulling } = usePullToRefresh({
    onRefresh: async () => {
      setIsRefreshing(true);
      await handleRefresh();
      setIsRefreshing(false);
    },
    isEnabled: true,
  });

  // Loading state
  if (!deviceId) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Vehicle not found</p>
        </div>
      </OwnerLayout>
    );
  }

  // Display values
  const displayName = llmSettings?.vehicle_alias || llmSettings?.vehicle_name || deviceId;
  const vehicleName = llmSettings?.vehicle_name || deviceId;
  const avatarUrl = llmSettings?.avatar_url || null;
  const personalityMode = llmSettings?.personality_mode || null;

  return (
    <OwnerLayout hideNavigation>
      <PullToRefresh
        isPulling={isPulling}
        pullProgress={pullProgress}
        isRefreshing={isRefreshing}
      />

      <div ref={containerRef} className="flex flex-col min-h-full overflow-y-auto">
        {/* Header */}
        <ProfileHeader
          displayName={displayName}
          vehicleName={vehicleName}
          avatarUrl={avatarUrl}
          personalityMode={personalityMode}
          status={status}
          lastUpdate={liveData?.lastUpdate ?? null}
          onBack={() => navigate("/owner/vehicles")}
          onSettings={() => navigate(`/owner/chat/${deviceId}`)}
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
              ignitionOn={liveData?.ignitionOn ?? null}
              speed={liveData?.speed ?? 0}
              isOnline={isOnline}
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
            />
          </div>
        </ScrollArea>
      </div>

      {/* Trip Playback Dialog */}
      {selectedTrip && (
        <TripPlaybackDialog
          trip={selectedTrip}
          open={!!selectedTrip}
          onOpenChange={(open) => !open && setSelectedTrip(null)}
        />
      )}
    </OwnerLayout>
  );
}
