import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { OwnerLayout } from "@/components/layouts/OwnerLayout";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/timezone";

import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { fetchVehicleLiveDataDirect, type VehicleLiveData, useVehicleLiveData } from "@/hooks/useVehicleLiveData";
import { useAddress } from "@/hooks/useAddress";

import { Battery, ChevronDown, Gauge, List, MapPin, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import { VehicleRequestDialog } from "@/components/owner/VehicleRequestDialog";

const STORAGE_KEY = "owner-selected-device-id";

type ChipVariant = "success" | "danger" | "muted" | "warning";

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
        <div className={cn("text-[11px] font-medium", hero ? "text-accent-foreground/80" : "text-muted-foreground")}>
          {title}
        </div>
      </div>
      <div className="mt-4">
        <div className={cn("text-3xl font-semibold tracking-tight", hero ? "text-accent-foreground" : "text-foreground")}>
          {value}
          {unit ? (
            <span className={cn("ml-1 text-sm font-normal", hero ? "text-accent-foreground/80" : "text-muted-foreground")}>
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

  const handleManualRefresh = useCallback(async () => {
    if (!selectedDeviceId) return;
    setIsRefreshing(true);
    try {
      const fresh = await fetchVehicleLiveDataDirect(selectedDeviceId, { timeoutMs: 8000 });
      setDirectOverride({ data: fresh, fetchedAt: Date.now() });
      toast.success("Updated live status");
    } catch (e: any) {
      toast.error("Live refresh failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedDeviceId]);

  const handlePullToRefresh = useCallback(async () => {
    await refetchLive();
  }, [refetchLive]);

  const showEmpty = !vehiclesLoading && (vehicles?.length || 0) === 0;
  const showLoading = vehiclesLoading || liveLoading || !selectedDeviceId || !selectedVehicle;

  const speedValue = typeof displayData?.speed === "number" ? Math.round(displayData.speed).toString() : "--";
  const distanceValue = typeof displayData?.totalMileageKm === "number" ? displayData.totalMileageKm.toLocaleString() : "--";
  const batteryValue = typeof displayData?.batteryPercent === "number" ? `${displayData.batteryPercent}` : "--";
  const overspeedValue = displayData?.isOverspeeding ? "Yes" : "No";

  return (
    <OwnerLayout>
      <PullToRefresh onRefresh={handlePullToRefresh}>
        <div className="mx-auto w-full max-w-md pb-6">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-[env(safe-area-inset-top)] -mt-[env(safe-area-inset-top)]">
            <div className="px-1 pt-2 pb-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => navigate("/owner/vehicles/list")}
                  className="w-11 h-11 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset"
                  title="All vehicles"
                >
                  <List className="h-5 w-5 text-foreground" />
                </button>

                {/* Center pill */}
                <div className="flex-1 flex justify-center">
                  <Select
                    value={selectedDeviceId}
                    onValueChange={(v) => setSelectedDeviceId(v)}
                    disabled={!vehicles || vehicles.length === 0}
                  >
                    <SelectTrigger className={cn(
                      "w-full max-w-[240px] h-12 rounded-full border-0 bg-card shadow-neumorphic-sm",
                      "px-4 focus:ring-2 focus:ring-accent/30 focus:ring-offset-0"
                    )}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", statusDotClass)} />
                        <SelectValue
                          placeholder="Select vehicle"
                          className="min-w-0"
                        />
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </SelectTrigger>
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

                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing || !selectedDeviceId}
                  className="w-11 h-11 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset disabled:opacity-50"
                  title="Refresh live"
                >
                  <RefreshCw className={cn("h-5 w-5 text-foreground", isRefreshing && "animate-spin")} />
                </button>
              </div>
            </div>
          </div>

          {showEmpty ? (
            <div className="mt-10 text-center">
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
            <div className="mt-8 space-y-4 px-1">
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
              {/* Status chips */}
              <div className="flex flex-wrap gap-2">
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

              {/* Last updated row */}
              <div className="flex items-center justify-between rounded-2xl bg-card shadow-neumorphic-inset px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  Last updated{" "}
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
                <MetricCard title="Overspeed" value={overspeedValue} icon={ShieldAlert} />
                <MetricCard title="Total Distance" value={distanceValue} unit="km" icon={Gauge} />
                <MetricCard title="Battery" value={batteryValue} unit="%" icon={Battery} />
              </div>

              {/* Location card */}
              <button
                onClick={() => navigate(`/owner/vehicle/${selectedDeviceId}`)}
                className={cn(
                  "w-full text-left rounded-2xl bg-card shadow-neumorphic-sm p-4 transition-all duration-200",
                  "hover:shadow-neumorphic active:shadow-neumorphic-inset"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div className="mt-1 text-sm text-foreground font-medium leading-snug">
                      {displayData?.latitude == null || displayData?.longitude == null
                        ? "Location unavailable"
                        : address || "Address not found"}
                    </div>
                    <div className="mt-2 text-xs text-accent font-medium">View details</div>
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </PullToRefresh>
    </OwnerLayout>
  );
}

