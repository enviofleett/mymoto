import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/timezone";

import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { fetchVehicleLiveDataDirect, type VehicleLiveData, useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useDailyTravelStats } from "@/hooks/useDailyTravelStats";
import { useAddress } from "@/hooks/useAddress";
import { useRealtimeTripUpdates } from "@/hooks/useTripSync";

import { Battery, Car, Gauge, MapPin, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import mymotoLogo from "@/assets/mymoto-logo-new.png";
import { VehicleRequestDialog } from "@/components/owner/VehicleRequestDialog";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";

const STORAGE_KEY = "owner-selected-device-id";

type ChipVariant = "success" | "danger" | "muted" | "warning";

function toLagosYmd(d: Date) {
  return d.toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatLocationPreview(address: string | undefined): string {
  if (!address) return "Address not found";
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "Address not found";
  if (parts.length === 1) return parts[0];

  return `${parts[0]}, ${parts[1]}`;
}

function StatusChip({
  icon: Icon,
  label,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  variant: ChipVariant;
}) {
  const colors: Record<ChipVariant, string> = {
    success: "text-status-active",
    danger: "text-destructive",
    warning: "text-accent",
    muted: "text-muted-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
        "bg-card shadow-neumorphic-inset"
      )}
    >
      <div className="w-6 h-6 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
        <Icon className={cn("h-3.5 w-3.5", colors[variant])} />
      </div>
      <span className="text-foreground">{label}</span>
    </div>
  );
}

function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string;
  unit?: string;
  icon: React.ElementType;
  variant?: "hero" | "default";
}) {
  const hero = variant === "hero";
  return (
    <div
      className={cn(
        "rounded-2xl p-4 transition-all duration-200",
        hero
          ? "bg-accent text-accent-foreground shadow-neumorphic-button"
          : "bg-card shadow-neumorphic-inset"
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", hero ? "bg-accent-foreground/15" : "bg-card shadow-neumorphic-sm")}>
          <Icon className={cn("h-4 w-4", hero ? "text-accent-foreground" : "text-muted-foreground")} />
        </div>
        <div className={cn("text-[11px] font-medium", hero ? "text-accent-foreground/85" : "text-subtle-foreground")}>
          {title}
        </div>
      </div>
      <div className="mt-4">
        <div className={cn("text-3xl font-semibold tracking-tight", hero ? "text-accent-foreground" : "text-foreground")}>
          {value}
          {unit ? (
            <span className={cn("ml-1 text-sm font-normal", hero ? "text-accent-foreground/85" : "text-subtle-foreground")}>
              {unit}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OwnerVehiclesDashboard() {
  const navigate = useNavigate();
  const { data: vehicles, isLoading: vehiclesLoading } = useOwnerVehicles();

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [directOverride, setDirectOverride] = useState<{ data: VehicleLiveData; fetchedAt: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Select initial device id (persisted)
  useEffect(() => {
    if (!vehicles || vehicles.length === 0) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const hasStored = stored && vehicles.some((v) => v.deviceId === stored);

    const initial =
      vehicles.length === 1
        ? vehicles[0].deviceId
        : hasStored
          ? (stored as string)
          : vehicles[0].deviceId;

    setSelectedDeviceId(initial);
  }, [vehicles]);

  // Persist selection
  useEffect(() => {
    if (!selectedDeviceId) return;
    try {
      localStorage.setItem(STORAGE_KEY, selectedDeviceId);
    } catch {
      // ignore
    }
  }, [selectedDeviceId]);

  // Expire direct override
  useEffect(() => {
    if (!directOverride) return;
    const ttlMs = 20_000;
    const t = setTimeout(() => setDirectOverride(null), ttlMs);
    return () => clearTimeout(t);
  }, [directOverride]);

  const selectedVehicle = useMemo(
    () => vehicles?.find((v) => v.deviceId === selectedDeviceId) || null,
    [vehicles, selectedDeviceId]
  );

  useRealtimeTripUpdates(selectedDeviceId || null, !!selectedDeviceId);

  const {
    data: dbLive,
    isLoading: liveLoading,
    refetch: refetchLive,
  } = useVehicleLiveData(selectedDeviceId || null);

  const displayData = useMemo(() => {
    const now = Date.now();
    const overrideFresh = directOverride && now - directOverride.fetchedAt < 20_000;
    if (overrideFresh) return directOverride.data;
    return dbLive || null;
  }, [directOverride, dbLive]);

  const { address } = useAddress(displayData?.latitude ?? null, displayData?.longitude ?? null);

  const statusDotClass = useMemo(() => {
    if (!displayData?.isOnline) return "bg-muted-foreground";
    if ((displayData.ignitionOn === false || displayData.ignitionOn === null) && displayData.speed === 0) {
      return "bg-accent shadow-[0_0_8px_hsl(24_95%_53%/0.5)]";
    }
    return "bg-status-active shadow-[0_0_8px_hsl(142_70%_50%/0.5)]";
  }, [displayData?.ignitionOn, displayData?.isOnline, displayData?.speed]);

  // Compute per-render so it naturally rolls over after midnight Lagos time (the page re-renders regularly).
  const todayYmd = toLagosYmd(new Date());
  const {
    data: dailyTravel,
    isLoading: dailyTravelLoading,
    isError: dailyTravelError,
    refetch: refetchDailyTravel,
  } = useDailyTravelStats({
    deviceId: selectedDeviceId,
    startDate: todayYmd,
    endDate: todayYmd,
    enabled: !!selectedDeviceId,
  });

  const todayStat = dailyTravel?.daily_stats?.[0] ?? null;

  const handleManualRefresh = useCallback(async () => {
    if (!selectedDeviceId) return;
    setIsRefreshing(true);
    try {
      const fresh = await fetchVehicleLiveDataDirect(selectedDeviceId, { timeoutMs: 8000 });
      setDirectOverride({ data: fresh, fetchedAt: Date.now() });
      // Keep "Trips Today" / "Distance Today" in sync with manual refresh.
      refetchDailyTravel();
      toast.success("Updated live status");
    } catch (e: any) {
      toast.error("Live refresh failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchDailyTravel, selectedDeviceId]);

  const handlePullToRefresh = useCallback(async () => {
    await Promise.all([refetchLive(), refetchDailyTravel()]);
  }, [refetchDailyTravel, refetchLive]);

  const showEmpty = !vehiclesLoading && (vehicles?.length || 0) === 0;
  const showLoading = vehiclesLoading || liveLoading || !selectedDeviceId || !selectedVehicle;

  const speedValue = typeof displayData?.speed === "number" ? Math.round(displayData.speed).toString() : "--";
  const dailyReady = !dailyTravelLoading && !dailyTravelError;
  const todayDistanceKm =
    typeof todayStat?.total_distance_km === "number"
      ? todayStat.total_distance_km
      : typeof todayStat?.total_distance_km === "string"
        ? Number(todayStat.total_distance_km)
        : null;
  const tripsTodayCount =
    typeof todayStat?.trip_count === "number"
      ? todayStat.trip_count
      : typeof todayStat?.trip_count === "string"
        ? Number(todayStat.trip_count)
        : null;
  const todayDistanceValue =
    dailyReady
      ? typeof todayDistanceKm === "number" && Number.isFinite(todayDistanceKm)
        ? todayDistanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : "0"
      : "--";
  const batteryValue = typeof displayData?.batteryPercent === "number" ? `${displayData.batteryPercent}` : "--";
  const tripsTodayValue =
    dailyReady ? (typeof tripsTodayCount === "number" && Number.isFinite(tripsTodayCount) ? `${tripsTodayCount}` : "0") : "--";
  const locationPreview = displayData?.latitude == null || displayData?.longitude == null
    ? "Location unavailable"
    : formatLocationPreview(address);
  const lastSeenLabel = displayData?.lastUpdate ? formatRelativeTime(displayData.lastUpdate) : "--";
  const statusText =
    displayData == null
      ? "No data"
      : !displayData.isOnline
        ? "Offline"
        : displayData.speed && displayData.speed > 0
          ? "Moving"
          : displayData.ignitionOn
            ? "Ignition ON"
            : "Parked";
  const batteryText = typeof displayData?.batteryPercent === "number" ? `${displayData.batteryPercent}%` : "--";
  const ignitionText =
    displayData?.ignitionOn == null ? "Ignition --" : displayData.ignitionOn ? "Ignition ON" : "Ignition OFF";

  return (
    <OwnerLayout>
      <PullToRefresh onRefresh={handlePullToRefresh}>
        <div className="mx-auto w-full max-w-md pb-24 sm:pb-32 page-footer-gap-roomy">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <div className="px-1 pt-2 pb-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => navigate("/owner/vehicles/list")}
                  className="w-11 h-11 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset"
                  title="All vehicles"
                >
                  <img src={mymotoLogo} alt="MyMoto" className="h-6 w-6" />
                </button>

                {/* Center pill */}
                <div className="flex-1 flex justify-center">
                  <Select
                    value={selectedDeviceId}
                    onValueChange={(v) => setSelectedDeviceId(v)}
                    disabled={!vehicles || vehicles.length === 0}
                  >
                    <SelectPrimitive.Trigger
                      className={cn(
                        "flex h-10 w-full items-center justify-center rounded-full border-0 bg-card shadow-neumorphic-sm relative",
                        "px-4 focus:ring-2 focus:ring-accent/30 focus:ring-offset-0 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                        "w-full max-w-full sm:max-w-[240px] h-12"
                      )}
                    >
                      <div className="flex items-center justify-center text-center gap-2">
                        <span className={cn("inline-block w-2 h-2 rounded-full", statusDotClass)} />
                        {selectedVehicle ? selectedVehicle.name : "Select vehicle"}
                      </div>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-50">
                          <path d="m6 9 6 6 6-6"/>
                        </svg>
                      </div>
                    </SelectPrimitive.Trigger>
                    <SelectContent>
                      {(vehicles || []).map((v) => (
                        <SelectItem key={v.deviceId} value={v.deviceId}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn("w-2 h-2 rounded-full", v.status === "online" ? "bg-status-active" : v.status === "charging" ? "bg-accent" : "bg-muted-foreground")} />
                            <span className="truncate">{v.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {showEmpty ? (
            <div className="mt-10 text-center footer-gap">
              <div className="w-20 h-20 mx-auto rounded-full shadow-neumorphic bg-card flex items-center justify-center mb-4">
                <MapPin className="h-9 w-9 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No vehicles yet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Request a vehicle connection to start tracking.
              </p>
              <div className="mt-4 flex justify-center">
                <VehicleRequestDialog
                  trigger={
                    <button className="h-12 px-5 rounded-full bg-card shadow-neumorphic-button text-accent font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30">
                      Request Vehicle
                    </button>
                  }
                />
              </div>
            </div>
          ) : showLoading ? (
            <div className="mt-8 space-y-4 px-1 footer-gap">
              <div className="h-10 rounded-2xl bg-card shadow-neumorphic-inset" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-28 rounded-2xl bg-card shadow-neumorphic-inset" />
                <div className="h-28 rounded-2xl bg-card shadow-neumorphic-inset" />
                <div className="h-28 rounded-2xl bg-card shadow-neumorphic-inset" />
                <div className="h-28 rounded-2xl bg-card shadow-neumorphic-inset" />
              </div>
              <div className="h-20 rounded-2xl bg-card shadow-neumorphic-inset" />
            </div>
          ) : (
            <div className="mt-3 space-y-4 px-1">
              {/* Status chips - Centralized */}
              <div className="flex justify-center">
                <div className="flex flex-wrap justify-center gap-2 max-w-full">
                  <StatusChip
                    icon={Zap}
                    label={displayData?.isOnline ? "Online" : "Offline"}
                    variant={displayData?.isOnline ? "success" : "muted"}
                  />
                  <StatusChip
                    icon={Gauge}
                    label={displayData?.ignitionOn ? "Ignition ON" : "Ignition OFF"}
                    variant={displayData?.ignitionOn ? "warning" : "muted"}
                  />
                  <StatusChip
                    icon={ShieldAlert}
                    label={displayData?.isOverspeeding ? "Overspeed" : "Normal"}
                    variant={displayData?.isOverspeeding ? "danger" : "muted"}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-card shadow-neumorphic-inset px-4 py-3">
                <div className="text-xs text-subtle-foreground">
                  Last sync{" "}
                  <span className="text-foreground font-medium">
                    {displayData?.lastUpdate ? formatRelativeTime(displayData.lastUpdate) : "--"}
                  </span>
                </div>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="w-9 h-9 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset disabled:opacity-50"
                  title="Refresh live"
                >
                  <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isRefreshing && "animate-spin")} />
                </button>
              </div>

              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-4">
                <MetricCard title="Speed" value={speedValue} unit="km/h" icon={Gauge} variant="hero" />
                <MetricCard title="Trips Today" value={tripsTodayValue} icon={Car} />
                <MetricCard title="Distance Today" value={todayDistanceValue} unit="km" icon={MapPin} />
                <MetricCard title="Battery" value={batteryValue} unit="%" icon={Battery} />
              </div>

              {/* Map Section - dynamic height with overlay location card */}
              <div 
                className={cn(
                  "w-full rounded-2xl rounded-system rounded-fluid bg-card shadow-neumorphic-sm overflow-hidden transition-all duration-200 footer-gap relative",
                  "hover:shadow-neumorphic"
                )}
                style={{ 
                  height: 'calc(100dvh - 28rem)', // Approximate available space: viewport - (header + stats + footer)
                  minHeight: '320px' 
                }}
              >
                {/* Map */}
                <div className="absolute inset-0 w-full h-full">
                  {displayData?.latitude != null && displayData?.longitude != null ? (
                    <VehicleLocationMap
                      latitude={displayData.latitude}
                      longitude={displayData.longitude}
                      address={address}
                      vehicleName={selectedVehicle?.name || selectedDeviceId}
                      showAddressCard={false}
                      mapHeight="h-full w-full"
                      className="rounded-none h-full w-full"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-muted/30">
                      <div className="text-center">
                        <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">Location unavailable</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Location Overlay Card */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div
                    className={cn(
                      "rounded-xl bg-card/95 backdrop-blur-md shadow-lg border border-border/50 p-4 cursor-pointer",
                      "transition-all duration-200 active:scale-[0.98]"
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/owner/vehicle/${selectedDeviceId}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigate(`/owner/vehicle/${selectedDeviceId}`);
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground font-medium">Current Location</div>
                        <div className="mt-0.5 text-sm text-foreground font-semibold leading-snug line-clamp-2">
                          {locationPreview}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          <span>Last: {lastSeenLabel}</span>
                          <span>Status: {statusText}</span>
                          <span>Battery: {batteryText}</span>
                          <span>{ignitionText}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground">
                            Tap for details
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/owner/vehicle/${selectedDeviceId}`);
                            }}
                            className="text-xs text-primary font-medium hover:underline underline-offset-2"
                          >
                            View full profile
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PullToRefresh>
    </OwnerLayout>
  );
}
