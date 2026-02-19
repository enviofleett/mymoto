import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

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
import { useRealtimeVehicleUpdates } from "@/hooks/useRealtimeVehicleUpdates";
import { supabase } from "@/integrations/supabase/client";

import { Battery, Car, ChevronRight, Gauge, MapPin, RefreshCw, ShieldAlert, Zap } from "lucide-react";
import mymotoLogo from "@/assets/mymoto-logo-new.png";
import { VehicleRequestDialog } from "@/components/owner/VehicleRequestDialog";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
import { useAuth } from "@/contexts/AuthContext";
import { trackEventOnce } from "@/lib/analytics";

const STORAGE_KEY = "owner-selected-device-id";
const LIVE_CACHE_KEY_PREFIX = "owner-live-cache-v1";
const DIRECT_OVERRIDE_TTL_MS = 60_000;

function getLiveCacheKey(deviceId: string) {
  return `${LIVE_CACHE_KEY_PREFIX}:${deviceId}`;
}

function readCachedLive(deviceId: string): { data: VehicleLiveData; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(getLiveCacheKey(deviceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: any; fetchedAt: number };
    if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.data) return null;
    const d = parsed.data;
    const hydrated: VehicleLiveData = {
      ...d,
      lastUpdate: d.lastUpdate ? new Date(d.lastUpdate) : null,
      lastGpsFix: d.lastGpsFix ? new Date(d.lastGpsFix) : null,
      lastSyncedAt: d.lastSyncedAt ? new Date(d.lastSyncedAt) : null,
    };
    return { data: hydrated, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCachedLive(deviceId: string, payload: { data: VehicleLiveData; fetchedAt: number }) {
  try {
    const serialized = JSON.stringify({
      data: {
        ...payload.data,
        lastUpdate: payload.data.lastUpdate ? payload.data.lastUpdate.toISOString() : null,
        lastGpsFix: payload.data.lastGpsFix ? payload.data.lastGpsFix.toISOString() : null,
        lastSyncedAt: payload.data.lastSyncedAt ? payload.data.lastSyncedAt.toISOString() : null,
      },
      fetchedAt: payload.fetchedAt,
    });
    localStorage.setItem(getLiveCacheKey(deviceId), serialized);
  } catch {
  }
}

export async function fetchLatestTripSummary(deviceId: string): Promise<unknown> {
  const { data, error } = await (supabase as any)
    .from("gps51_trips")
    .select("id, device_id, start_time, end_time, distance_meters, duration_seconds")
    .eq("device_id", deviceId)
    .order("start_time", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const rows = (data as any[]) || [];
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    device_id: row.device_id,
    start_time: row.start_time,
    end_time: row.end_time,
    distance_km: typeof row.distance_meters === "number" ? row.distance_meters / 1000 : null,
    duration_seconds: row.duration_seconds ?? null,
  };
}

export interface LiveRefreshOptions {
  deviceId: string;
  getCurrent: () => VehicleLiveData | null;
  fetchLive: (deviceId: string) => Promise<VehicleLiveData>;
  refetchDaily: () => Promise<unknown> | void;
  applyNewData: (payload: { data: VehicleLiveData; fetchedAt: number }) => void;
  onSuccess: (message: string) => void;
  onError: (message: string, description?: string) => void;
  onStale?: () => void;
  fetchLatestTrip?: (deviceId: string) => Promise<unknown>;
  cacheLatestTrip?: (trip: unknown) => void;
  signal?: AbortSignal;
  maxAttempts?: number;
  baseDelayMs?: number;
  now?: () => number;
}

export async function runLiveRefresh(options: LiveRefreshOptions) {
  const {
    deviceId,
    getCurrent,
    fetchLive,
    refetchDaily,
    applyNewData,
    onSuccess,
    onError,
    onStale,
    fetchLatestTrip,
    cacheLatestTrip,
    signal,
    maxAttempts,
    baseDelayMs,
    now,
  } = options;

  const attempts = maxAttempts ?? 3;
  const baseDelay = baseDelayMs ?? 500;
  const nowFn = now ?? (() => Date.now());

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < attempts) {
    if (signal?.aborted) {
      return;
    }
    try {
      const fresh = await fetchLive(deviceId);
      if (signal?.aborted) {
        return;
      }

      const current = getCurrent();
      const currentTs = current?.lastUpdate ? current.lastUpdate.getTime() : 0;
      const newTs = fresh.lastUpdate ? fresh.lastUpdate.getTime() : 0;

      if (currentTs && newTs && newTs <= currentTs) {
        if (onStale) {
          onStale();
        }
      } else {
        const fetchedAt = nowFn();
        applyNewData({ data: fresh, fetchedAt });
        await Promise.resolve(refetchDaily());
        onSuccess("Updated live status");
      }

      if (fetchLatestTrip) {
        try {
          const trip = await fetchLatestTrip(deviceId);
          if (trip && cacheLatestTrip) {
            cacheLatestTrip(trip);
          }
        } catch {
        }
      }

      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (attempt >= attempts) {
        break;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError && !signal?.aborted) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    onError("Live refresh failed", message);
  }
}

type ChipVariant = "success" | "danger" | "muted" | "warning";

function toLagosYmd(d: Date) {
  return d.toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatShortAddress(address: string | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
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
  const { user } = useAuth();
  const { data: vehicles, isLoading: vehiclesLoading } = useOwnerVehicles();
  const { data: vehicleRequests } = useQuery({
    queryKey: ["owner-vehicle-requests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vehicle_onboarding_requests")
        .select("status, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as Array<{ status: string; created_at: string }>) ?? [];
    },
  });

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [directOverride, setDirectOverride] = useState<{ data: VehicleLiveData; fetchedAt: number } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshStateRef = useRef<{ inFlight: boolean; lastTs: number }>({ inFlight: false, lastTs: 0 });
  const refreshAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (!selectedDeviceId || directOverride) return;
    try {
      const cached = readCachedLive(selectedDeviceId);
      if (cached) {
        setDirectOverride(cached);
      }
    } catch {
    }
  }, [directOverride, selectedDeviceId]);

  useEffect(() => {
    return () => {
      if (refreshAbortRef.current) {
        refreshAbortRef.current.abort();
        refreshAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (refreshAbortRef.current) {
      refreshAbortRef.current.abort();
      refreshAbortRef.current = null;
    }
    refreshStateRef.current.inFlight = false;
    setIsRefreshing(false);
  }, [selectedDeviceId]);

  // Expire direct override
  useEffect(() => {
    if (!directOverride) return;
    const ttlMs = DIRECT_OVERRIDE_TTL_MS;
    const t = setTimeout(() => setDirectOverride(null), ttlMs);
    return () => clearTimeout(t);
  }, [directOverride]);

  const selectedVehicle = useMemo(
    () => vehicles?.find((v) => v.deviceId === selectedDeviceId) || null,
    [vehicles, selectedDeviceId]
  );

  useRealtimeTripUpdates(selectedDeviceId || null, !!selectedDeviceId);
  useRealtimeVehicleUpdates(selectedDeviceId || null);

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

  const { address, isLoading: addressLoading } = useAddress(displayData?.latitude ?? null, displayData?.longitude ?? null);

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
     const now = Date.now();
     const state = refreshStateRef.current;
     if (state.inFlight) return;
     if (now - state.lastTs < 500) return;
     state.inFlight = true;
     state.lastTs = now;
     const controller = new AbortController();
     refreshAbortRef.current = controller;
    setIsRefreshing(true);
    try {
      await runLiveRefresh({
        deviceId: selectedDeviceId,
        getCurrent: () => displayData,
        fetchLive: (id) => fetchVehicleLiveDataDirect(id, { timeoutMs: 8000 }),
        refetchDaily: () => refetchDailyTravel(),
        applyNewData: ({ data, fetchedAt }) => {
          setDirectOverride({ data, fetchedAt });
          writeCachedLive(selectedDeviceId, { data, fetchedAt });
        },
        onSuccess: (message) => {
          toast.success(message);
        },
        onError: (message, description) => {
          toast.error(message, {
            description: description || "Please try again.",
          });
        },
        onStale: () => {
          toast.info("Live data is already up to date");
        },
        fetchLatestTrip: fetchLatestTripSummary,
        signal: controller.signal,
      });
    } finally {
      setIsRefreshing(false);
      state.inFlight = false;
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, [displayData, refetchDailyTravel, selectedDeviceId]);

  const handlePullToRefresh = useCallback(async () => {
    await Promise.all([handleManualRefresh(), refetchLive()]);
  }, [handleManualRefresh, refetchLive]);

  const showEmpty = !vehiclesLoading && (vehicles?.length || 0) === 0;
  const pendingRequestsCount = (vehicleRequests || []).filter((r) => r.status === "pending").length;
  const showLoading = vehiclesLoading || liveLoading || !selectedDeviceId || !selectedVehicle;

  useEffect(() => {
    if (!user?.id || !vehicles || vehicles.length === 0) return;
    void trackEventOnce("first_vehicle_visible", user.id, {
      vehicle_count: vehicles.length,
    });
  }, [user?.id, vehicles]);

  useEffect(() => {
    if (!user?.id || !vehicleRequests || vehicleRequests.length === 0) return;
    const latestApproved = vehicleRequests.find((r) => r.status === "approved");
    if (!latestApproved) return;
    void trackEventOnce("vehicle_request_approved", `${user.id}:${latestApproved.created_at}`, {
      approved_at: latestApproved.created_at,
    });
  }, [user?.id, vehicleRequests]);

  const isMoving =
    !!displayData?.isOnline &&
    typeof displayData.speed === "number" &&
    displayData.speed > 2;
  const hasAlarm = !!displayData?.isOverspeeding;

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
  const canOpenProfile = Boolean(selectedDeviceId);
  const hasCoordinates = typeof displayData?.latitude === "number" && typeof displayData?.longitude === "number";
  const mapsHref = hasCoordinates
    ? `https://www.google.com/maps?q=${displayData.latitude},${displayData.longitude}`
    : null;
  const locationCard = useMemo(() => {
    if (!hasCoordinates) {
      return {
        label: "Unavailable",
        dotClass: "bg-muted-foreground",
        primary: "Location unavailable",
        secondary: "No GPS fix available yet",
      };
    }

    const shortAddress = formatShortAddress(address);
    const fallbackCoords = `${displayData!.latitude!.toFixed(4)}, ${displayData!.longitude!.toFixed(4)}`;
    const addressLabel = shortAddress ?? fallbackCoords;
    const lastUpdate = displayData?.lastUpdate ?? null;
    const minutesSinceUpdate = lastUpdate ? (Date.now() - lastUpdate.getTime()) / (1000 * 60) : null;

    if (addressLoading && !shortAddress) {
      return {
        label: "Resolving",
        dotClass: "bg-accent",
        primary: fallbackCoords,
        secondary: "Resolving geocoded address...",
      };
    }

    if (displayData?.isOnline && minutesSinceUpdate !== null && minutesSinceUpdate <= 2) {
      return {
        label: "Live",
        dotClass: "bg-status-active shadow-[0_0_8px_hsl(142_70%_50%/0.45)]",
        primary: addressLabel,
        secondary: lastUpdate ? `Updated ${formatRelativeTime(lastUpdate)}` : "Updated just now",
      };
    }

    if (minutesSinceUpdate !== null && minutesSinceUpdate <= 30) {
      return {
        label: "Last known",
        dotClass: "bg-accent shadow-[0_0_8px_hsl(24_95%_53%/0.45)]",
        primary: addressLabel,
        secondary: lastUpdate ? `Last update ${formatRelativeTime(lastUpdate)}` : "Recent last-known position",
      };
    }

    return {
      label: "Unavailable",
      dotClass: "bg-muted-foreground",
      primary: shortAddress ? `Last known: ${shortAddress}` : "Location unavailable",
      secondary: lastUpdate ? `Stale since ${formatRelativeTime(lastUpdate)}` : "No recent position update",
    };
  }, [address, addressLoading, displayData, hasCoordinates]);
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

                <VehicleRequestDialog
                  trigger={
                    <button className="w-11 h-11 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset ring-2 ring-accent/50">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  }
                />
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
              {pendingRequestsCount > 0 ? (
                <p className="text-xs text-accent mt-2">
                  {pendingRequestsCount} request{pendingRequestsCount > 1 ? "s" : ""} pending admin approval.
                </p>
              ) : null}
              <div className="mt-4 flex justify-center">
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={() => navigate("/login")}
                    className="h-12 px-5 rounded-full bg-card shadow-neumorphic-button text-foreground font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30"
                  >
                    Connect with GPS51 Login
                  </button>
                  <VehicleRequestDialog
                    trigger={
                      <button className="h-12 px-5 rounded-full bg-card shadow-neumorphic-button text-accent font-semibold transition-all duration-200 hover:ring-2 hover:ring-accent/30">
                        Request Vehicle Manually
                      </button>
                    }
                  />
                </div>
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

              {/* Circular map section */}
              <div
                data-testid="owner-circular-map"
                className={cn(
                  "mx-auto w-[min(78vw,20rem)] min-w-[15rem] aspect-square rounded-full bg-card border border-border/60 shadow-neumorphic-sm p-2 overflow-hidden transition-all duration-200 footer-gap",
                  "hover:shadow-neumorphic",
                  hasAlarm &&
                    "border-destructive/80 shadow-[0_0_32px_rgba(220,38,38,0.8)]",
                  !hasAlarm &&
                    isMoving &&
                    "border-accent shadow-[0_0_28px_hsl(24_95%_53%/0.8)]"
                )}
              >
                <div
                  className="h-full w-full rounded-full bg-card shadow-neumorphic-inset overflow-hidden"
                >
                  {displayData?.latitude != null && displayData?.longitude != null ? (
                    <VehicleLocationMap
                      latitude={displayData.latitude}
                      longitude={displayData.longitude}
                      address={address}
                      vehicleName={selectedVehicle?.name || selectedDeviceId}
                      showAddressCard={false}
                      controlsInset={true}
                      mapHeight="h-full"
                      className="h-full w-full rounded-full overflow-hidden"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-muted/30 rounded-full">
                      <div className="text-center">
                        <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs text-muted-foreground">Location unavailable</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                data-testid="owner-sync-container"
                className="rounded-2xl bg-card shadow-neumorphic-inset border border-border/60 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", locationCard.dotClass)} />
                      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        {locationCard.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {locationCard.primary}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {locationCard.secondary}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={handleManualRefresh}
                      disabled={isRefreshing}
                      className="w-9 h-9 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset disabled:opacity-50"
                      title="Refresh live"
                    >
                      <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isRefreshing && "animate-spin")} />
                    </button>
                    {mapsHref ? (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full bg-card shadow-neumorphic-sm px-3 py-1.5 text-[11px] font-medium text-foreground transition-all duration-200 hover:shadow-neumorphic active:shadow-neumorphic-inset"
                      >
                        Open Maps
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Metric cards */}
              <div data-testid="owner-metric-grid" className="grid grid-cols-2 gap-4">
                <MetricCard title="Speed" value={speedValue} unit="km/h" icon={Gauge} variant="hero" />
                <MetricCard title="Trips Today" value={tripsTodayValue} icon={Car} />
                <MetricCard title="Distance Today" value={todayDistanceValue} unit="km" icon={MapPin} />
                <MetricCard title="Battery" value={batteryValue} unit="%" icon={Battery} />
              </div>

              <button
                type="button"
                data-testid="owner-open-profile-button"
                onClick={() => navigate(`/owner/vehicle/${selectedDeviceId}`)}
                disabled={!canOpenProfile}
                className={cn(
                  "w-full min-h-11 rounded-full bg-card shadow-neumorphic-button px-5 py-3",
                  "flex items-center justify-between gap-3 text-left transition-all duration-200",
                  "hover:ring-2 hover:ring-accent/30 active:shadow-neumorphic-inset",
                  "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-0",
                  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:ring-0"
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">View Full Vehicle Profile</div>
                  <div className="text-[11px] text-muted-foreground">Open trips, reports, controls, and settings</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-card shadow-neumorphic-sm flex items-center justify-center shrink-0">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            </div>
          )}
        </div>
      </PullToRefresh>
    </OwnerLayout>
  );
}
