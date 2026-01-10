import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { useAddress } from "@/hooks/useAddress";
import {
  useVehicleTrips,
  useVehicleEvents,
  useVehicleLLMSettings,
  useMileageStats,
  useDailyMileage,
  useVehicleCommand,
  getPersonalityLabel,
  type VehicleTrip,
  type VehicleEvent,
} from "@/hooks/useVehicleProfile";
import { TripPlaybackDialog } from "@/components/profile/TripPlaybackDialog";
import {
  ArrowLeft,
  Settings,
  Battery,
  Gauge,
  Power,
  MapPin,
  Navigation,
  Calendar,
  TrendingUp,
  Route,
  Bell,
  Info,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Zap,
  Loader2,
  Play,
} from "lucide-react";
import { format, parseISO, isSameDay, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

const avatarColors = ["from-blue-500 to-purple-500"];

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  
  // Engine control confirmation state
  const [showEngineConfirm, setShowEngineConfirm] = useState(false);
  const [pendingEngineCommand, setPendingEngineCommand] = useState<"start_engine" | "stop_engine" | null>(null);
  
  // Trip playback state
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);
  const [showTripPlayback, setShowTripPlayback] = useState(false);
  
  // Data fetching hooks
  const { data: vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useOwnerVehicles();
  const { data: trips, isLoading: tripsLoading, refetch: refetchTrips } = useVehicleTrips(deviceId ?? null);
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useVehicleEvents(deviceId ?? null);
  const { data: llmSettings } = useVehicleLLMSettings(deviceId ?? null);
  const { data: mileageStats, refetch: refetchMileage } = useMileageStats(deviceId ?? null);
  const { data: dailyMileage, refetch: refetchDaily } = useDailyMileage(deviceId ?? null);
  
  // Command mutation
  const { mutate: executeCommand, isPending: isCommandPending } = useVehicleCommand();

  const vehicle = vehicles?.find((v) => v.deviceId === deviceId);

  // Reverse geocoding for current location address
  const { address: currentAddress, isLoading: addressLoading } = useAddress(
    vehicle?.latitude,
    vehicle?.longitude
  );

  const isLoading = vehiclesLoading;

  // Filter today's trips
  const todaysTrips = useMemo(() => {
    if (!trips) return [];
    const today = new Date();
    return trips.filter(t => isSameDay(parseISO(t.start_time), today));
  }, [trips]);

  // Filter today's events/alerts
  const todaysAlerts = useMemo(() => {
    if (!events) return [];
    const today = new Date();
    return events.filter(e => isSameDay(parseISO(e.created_at), today));
  }, [events]);

  // Calculate trip stats from mileage data
  const tripStats = useMemo(() => {
    if (!mileageStats || !dailyMileage) {
      return { totalTrips: 0, avgTripsPerDay: 0, avgKmPerTrip: 0, peakTrips: 0 };
    }
    
    const totalTrips = mileageStats.trips_week;
    const avgTripsPerDay = totalTrips / 7;
    const avgKmPerTrip = totalTrips > 0 ? mileageStats.week / totalTrips : 0;
    const peakTrips = Math.max(...dailyMileage.map(d => d.trips), 0);
    
    return { totalTrips, avgTripsPerDay, avgKmPerTrip, peakTrips };
  }, [mileageStats, dailyMileage]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetchVehicles(), 
      refetchTrips(), 
      refetchEvents(),
      refetchMileage(),
      refetchDaily(),
    ]);
  }, [refetchVehicles, refetchTrips, refetchEvents, refetchMileage, refetchDaily]);

  // Pull-to-refresh hook
  const { pullDistance, isRefreshing: isPullRefreshing, handlers } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  // Engine control handler
  const handleEngineToggle = () => {
    const command = vehicle?.ignition ? "stop_engine" : "start_engine";
    setPendingEngineCommand(command);
    setShowEngineConfirm(true);
  };

  const confirmEngineCommand = () => {
    if (!deviceId || !pendingEngineCommand) return;
    
    executeCommand({
      device_id: deviceId,
      command_type: pendingEngineCommand,
      confirmed: true,
    });
    
    setShowEngineConfirm(false);
    setPendingEngineCommand(null);
  };

  // Trip playback handler
  const handlePlayTrip = (trip: VehicleTrip) => {
    setSelectedTrip(trip);
    setShowTripPlayback(true);
  };

  // Get battery status label
  const getBatteryStatus = (battery: number | null) => {
    if (battery === null) return "Not reported";
    if (battery >= 80) return "Optimal";
    if (battery >= 50) return "Good";
    if (battery >= 20) return "Low";
    return "Critical";
  };

  const getBatteryColor = (battery: number | null) => {
    if (battery === null) return "text-muted-foreground";
    if (battery >= 80) return "text-green-500";
    if (battery >= 50) return "text-yellow-500";
    if (battery >= 20) return "text-orange-500";
    return "text-red-500";
  };

  // Google Maps link
  const getGoogleMapsLink = (lat: number, lon: number) => {
    return `https://www.google.com/maps?q=${lat},${lon}`;
  };

  // Get event icon
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "overspeed":
        return <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />;
      case "low_battery":
        return <Battery className="h-4 w-4 text-orange-500 mt-0.5" />;
      case "ignition_on":
        return <Zap className="h-4 w-4 text-green-500 mt-0.5" />;
      case "ignition_off":
        return <Power className="h-4 w-4 text-muted-foreground mt-0.5" />;
      case "offline":
        return <Info className="h-4 w-4 text-red-500 mt-0.5" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground mt-0.5" />;
    }
  };

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
      <div className="sticky top-0 z-10 bg-background px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

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
        <div className="pb-8">
          {/* Vehicle Avatar */}
          <div className="flex flex-col items-center py-6">
            <div className="relative mb-4">
              <div
                className={cn(
                  "w-32 h-32 rounded-full bg-gradient-to-br flex items-center justify-center",
                  avatarColors[0]
                )}
              >
                <span className="text-6xl">🚗</span>
              </div>
              <div
                className={cn(
                  "absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-background",
                  vehicle.status === "online"
                    ? "bg-green-500"
                    : vehicle.status === "charging"
                    ? "bg-yellow-500"
                    : "bg-muted-foreground"
                )}
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{vehicle.name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <span>✨</span> {getPersonalityLabel(llmSettings?.personality_mode)}
            </p>
            {vehicle.lastUpdate && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {format(vehicle.lastUpdate, "MMM d, HH:mm")}
              </p>
            )}
          </div>

          {/* Vehicle Status Section */}
          <div className="px-4 space-y-4">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Vehicle Status
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Battery */}
              <Card className="border-border bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Battery className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Battery</span>
                  </div>
                  <div className={cn("text-2xl font-bold", getBatteryColor(vehicle.battery))}>
                    {vehicle.battery !== null ? `${vehicle.battery}%` : "--%"}
                  </div>
                  <div className="text-xs text-muted-foreground">{getBatteryStatus(vehicle.battery)}</div>
                </CardContent>
              </Card>

              {/* Range/Mileage */}
              <Card className="border-border bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Mileage</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">
                    {vehicle.totalMileage !== null 
                      ? vehicle.totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                      : "--"} <span className="text-sm font-normal">km</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </CardContent>
              </Card>
            </div>

            {/* Engine Control */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-full bg-red-500/10">
                    <Power className="h-4 w-4 text-red-500" />
                  </div>
                  <span className="font-medium text-foreground">Engine Control</span>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Engine Status</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Info className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-muted-foreground">
                        {vehicle.ignition ? "Engine is running" : "Engine is off - vehicle is secured"}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-3 py-1",
                      vehicle.ignition
                        ? "border-green-500/50 text-green-500"
                        : "border-red-500/50 text-red-500"
                    )}
                  >
                    <span className="mr-1.5">●</span>
                    {vehicle.ignition ? "ON" : "OFF"}
                  </Badge>
                </div>

                <Button
                  className={cn(
                    "w-full",
                    vehicle.ignition
                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                  )}
                  variant="ghost"
                  onClick={handleEngineToggle}
                  disabled={isCommandPending}
                >
                  {isCommandPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Power className="h-4 w-4 mr-2" />
                  )}
                  {vehicle.ignition ? "Stop Engine" : "Start Engine"}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Remote engine control requires verification. Make sure the vehicle is in a safe location.
                </p>
              </CardContent>
            </Card>

            {/* Location */}
            <Card className="border-border bg-card/50 overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-muted to-muted/50 relative">
                {vehicle.latitude && vehicle.longitude ? (
                  <img
                    src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+ef4444(${vehicle.longitude},${vehicle.latitude})/${vehicle.longitude},${vehicle.latitude},14,0/400x160@2x?access_token=${import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}`}
                    alt="Vehicle location map"
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                )}
                {vehicle.latitude && vehicle.longitude && (
                  <a
                    href={getGoogleMapsLink(vehicle.latitude, vehicle.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground font-mono hover:bg-background/90 transition-colors flex items-center gap-1"
                  >
                    {vehicle.latitude.toFixed(4)}°, {vehicle.longitude.toFixed(4)}°
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-8 w-8 bg-background/50 backdrop-blur-sm"
                  onClick={handleRefresh}
                  disabled={isPullRefreshing}
                >
                  <RefreshCw className={cn("h-4 w-4", isPullRefreshing && "animate-spin")} />
                </Button>
              </div>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-primary/10">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">Current Location</div>
                      {vehicle.latitude && vehicle.longitude ? (
                        <>
                          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {addressLoading ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading address...
                              </span>
                            ) : currentAddress ? (
                              currentAddress
                            ) : (
                              `${vehicle.latitude.toFixed(4)}°, ${vehicle.longitude.toFixed(4)}°`
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Speed: {vehicle.speed} km/h
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">No GPS Signal</div>
                      )}
                    </div>
                  </div>
                  {vehicle.latitude && vehicle.longitude && (
                    <a
                      href={getGoogleMapsLink(vehicle.latitude, vehicle.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-sm transition-all hover:scale-105 shrink-0"
                    >
                      <Navigation className="h-3 w-3" />
                      Open in Maps
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Mileage Stats */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-primary" />
                    <span className="font-medium text-foreground">Mileage Report</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    Today
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm text-muted-foreground">Total Odometer</div>
                  <div className="text-3xl font-bold text-foreground">
                    {vehicle.totalMileage !== null 
                      ? vehicle.totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                      : "--"} <span className="text-base font-normal">km</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-purple-500/10 p-3 text-center">
                    <TrendingUp className="h-4 w-4 text-purple-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-purple-500">
                      {(mileageStats?.today ?? 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Today</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <Calendar className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">
                      {(mileageStats?.week ?? 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">This Week</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-lg font-bold text-primary">
                      {(mileageStats?.month ?? 0).toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">This Month</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Mileage Chart */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="font-medium text-foreground">Weekly Mileage Trend</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Last 7 days</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">{(mileageStats?.week ?? 0).toFixed(1)} km</div>
                    <div className="text-xs text-muted-foreground">Avg: {((mileageStats?.week ?? 0) / 7).toFixed(1)}/day</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyMileage || []}>
                      <defs>
                        <linearGradient id="mileageGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)} km`, 'Distance']}
                      />
                      <Area
                        type="monotone"
                        dataKey="distance"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#mileageGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Trip History */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Route className="h-5 w-5 text-primary" />
                    <span className="font-medium text-foreground">Trip History</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    Today
                  </div>
                </div>

                <div className="space-y-3">
                  {tripsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : todaysTrips.length > 0 ? (
                    todaysTrips.slice(0, 5).map((trip, index) => (
                      <div key={trip.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Trip {index + 1}</span>
                            <a
                              href={getGoogleMapsLink(trip.end_latitude, trip.end_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(parseISO(trip.start_time), 'h:mm a')} - {format(parseISO(trip.end_time), 'h:mm a')}
                          </div>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2">
                          <div>
                            <div className="text-sm">{trip.distance_km.toFixed(1)} km</div>
                            <div className="text-xs text-green-500">
                              {trip.duration_seconds ? Math.round(trip.duration_seconds / 60) : differenceInMinutes(parseISO(trip.end_time), parseISO(trip.start_time))} min
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePlayTrip(trip)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No trips recorded today</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total trips</span>
                  <div>
                    <span className="font-medium">{todaysTrips.length} trips</span>
                    <span className="text-primary ml-2">
                      {todaysTrips.reduce((sum, t) => sum + t.distance_km, 0).toFixed(1)} km
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trip Activity Chart */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Route className="h-5 w-5 text-primary" />
                      <span className="font-medium text-foreground">Trip Activity</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Last 7 days</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-500">{tripStats.totalTrips} trips</div>
                    <div className="text-xs text-muted-foreground">{(mileageStats?.week ?? 0).toFixed(1)} km total</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyMileage || []}>
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => [`${value} trips`, 'Trips']}
                      />
                      <Bar dataKey="trips" fill="hsl(270, 70%, 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">
                      {tripStats.avgTripsPerDay.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg trips/day</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-500">{tripStats.peakTrips}</div>
                    <div className="text-xs text-muted-foreground">Peak trips</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">
                      {tripStats.avgKmPerTrip.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg km/trip</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alarms & Alerts */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-yellow-500" />
                    <span className="font-medium text-foreground">Alarms & Alerts</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    Today
                  </div>
                </div>

                <div className="space-y-3">
                  {eventsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : todaysAlerts.length > 0 ? (
                    todaysAlerts.slice(0, 5).map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "p-3 rounded-lg",
                          event.severity === 'error' || event.severity === 'warning' 
                            ? "bg-yellow-500/10" 
                            : "bg-muted/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {getEventIcon(event.event_type)}
                          <div>
                            <div className="font-medium text-foreground">{event.title}</div>
                            <div className="text-sm text-muted-foreground">{event.message}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(parseISO(event.created_at), 'h:mm a')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No alerts today</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total alerts</span>
                  <div>
                    <span className="font-medium">{todaysAlerts.length}</span>
                    <span className="text-yellow-500 ml-2">
                      {todaysAlerts.filter(a => a.severity === 'warning' || a.severity === 'error').length} warnings
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Status */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-2">Current Status</div>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    vehicle.status === 'online' 
                      ? "bg-green-500/20" 
                      : vehicle.status === 'charging' 
                      ? "bg-yellow-500/20" 
                      : "bg-muted"
                  )}>
                    <span className="text-2xl">
                      {vehicle.status === 'online' ? "🚗" : vehicle.status === 'charging' ? "⚡" : "💤"}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-foreground capitalize">{vehicle.status}</div>
                    <div className="text-sm text-muted-foreground">
                      {vehicle.status === 'online' 
                        ? vehicle.speed > 0 ? `Moving at ${vehicle.speed} km/h` : "Stationary"
                        : vehicle.status === 'charging' 
                        ? "Charging in progress" 
                        : "Vehicle is parked"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Engine Control Confirmation Dialog */}
      <AlertDialog open={showEngineConfirm} onOpenChange={setShowEngineConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingEngineCommand === "stop_engine" ? "Stop Engine?" : "Start Engine?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEngineCommand === "stop_engine" 
                ? "This will remotely stop the engine. Make sure the vehicle is in a safe location before proceeding."
                : "This will remotely start the engine. Make sure the vehicle is in a safe location and all safety conditions are met."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingEngineCommand(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEngineCommand}
              className={cn(
                pendingEngineCommand === "stop_engine"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
              )}
            >
              {isCommandPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trip Playback Dialog */}
      <TripPlaybackDialog
        open={showTripPlayback}
        onOpenChange={setShowTripPlayback}
        deviceId={deviceId || ""}
        deviceName={vehicle.name}
        startTime={selectedTrip?.start_time}
        endTime={selectedTrip?.end_time}
      />
    </div>
  );
}
