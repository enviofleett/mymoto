import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VehiclePersonaSettings } from "@/components/fleet/VehiclePersonaSettings";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { fetchVehicleLiveDataDirect, VehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";
import { useVehicleLLMSettings, useVehicleTrips, useVehicleEvents, type VehicleTrip } from "@/hooks/useVehicleProfile";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { type DateRange } from "react-day-picker";

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

  // State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // CRITICAL FIX: Check deviceId BEFORE initializing hooks
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
  // DIRECT DATA FETCHING: 100% Accuracy from GPS 51
  // ============================================================================

  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
    refetch: refetchLive,
  } = useQuery({
    queryKey: ["vehicle-live-data-direct", deviceId],
    queryFn: async () => {
      try {
        return await fetchVehicleLiveDataDirect(deviceId);
      } catch (err) {
        console.error("Direct fetch failed:", err);
        throw err;
      }
    },
    enabled: !!deviceId,
    refetchInterval: 15000, // Poll GPS 51 every 15 seconds
    refetchOnWindowFocus: true,
    retry: 2,
  });

  // Keep track of last valid data to prevent UI flashing
  // FALLBACK STRATEGY: Use Live Data -> OwnerVehicle (DB) -> null
  const { data: ownerVehicles } = useOwnerVehicles();
  const vehicle = ownerVehicles?.find((v) => v.deviceId === deviceId);

  const displayData = useMemo(() => {
    // 1. Prefer Live Data if available and valid
    if (liveData) {
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
  }, [liveData, vehicle]);

  // Notify user if falling back to cached data due to error
  useEffect(() => {
    if (liveError && vehicle && !isRefreshing) {
      toast.error("Live update failed", {
        description: "Showing last known location and status",
      });
    }
  }, [liveError, vehicle, isRefreshing]);

  // Vehicle LLM settings (Avatar, Nickname)
  const { 
    data: llmSettings, 
    refetch: refetchProfile 
  } = useVehicleLLMSettings(deviceId, true);

  // Address lookup
  const { address, isLoading: addressLoading } = useAddress(
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  const { 
    data: trips, 
    isLoading: tripsLoading 
  } = useVehicleTrips(deviceId, { 
    dateRange, 
    live: true,
    limit: 50
  });

  const { 
    data: events, 
    isLoading: eventsLoading 
  } = useVehicleEvents(deviceId, { 
    dateRange,
    limit: 50
  });

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    if (!deviceId) return;

    setIsRefreshing(true);
    
    try {
      const results = await Promise.allSettled([
        refetchLive(),
        refetchProfile(),
      ]);

      const failed = results.some(r => r.status === 'rejected');
      if (failed) {
        throw new Error("Some data failed to refresh");
      }

      toast.success("Updated", { 
        description: "Latest data retrieved from GPS 51" 
      });
    } catch (error) {
      toast.error("Refresh failed", { 
        description: "Could not retrieve latest data" 
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [deviceId, refetchLive, refetchProfile]);

  const { pullDistance, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Display values with safe fallbacks

  const displayName = llmSettings?.nickname || vehicle?.plateNumber || deviceId;
  const plateNumber = vehicle?.plateNumber || deviceId;
  const vehicleName = deviceId;
  const avatarUrl = llmSettings?.avatar_url || null;
  const personalityMode = llmSettings?.personality_mode || null;

  // Loading and error states
  const isInitialLoading = liveLoading && !displayData;
  const hasCriticalError = liveError !== null && !displayData;
  const hasNoData = !liveLoading && !displayData && !liveError;
  
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

  if (hasNoData) {
    return (
      <OwnerLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md px-4">
            <p className="text-foreground font-medium mb-2">No vehicle data available</p>
            <Button onClick={() => refetchLive()}>Refresh</Button>
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
          vehicleName={vehicleName}
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
              isLoading={liveLoading || addressLoading}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
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
                deviceId={deviceId}
                ignitionOn={displayData?.ignitionOn ?? null}
                isOnline={status === "online" || status === "charging"}
              />
            </div>

            {/* Reports & Trips */}
            <ReportsSection
              deviceId={deviceId}
              trips={trips}
              events={events}
              tripsLoading={tripsLoading}
              eventsLoading={eventsLoading}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onPlayTrip={(trip) => {
                console.log("Play trip:", trip.id);
                toast.info("Trip playback", { description: "Opening trip details..." });
                // navigate(`/owner/trips/${trip.id}`);
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
            deviceId={deviceId} 
            vehicleName={displayName}
          />
        </DialogContent>
      </Dialog>
    </OwnerLayout>
  );
}
