import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useToast } from "@/hooks/use-toast";
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
  type TripFilterOptions,
  type EventFilterOptions,
} from "@/hooks/useVehicleProfile";
import { useRecentTripAnalytics, getScoreColor } from "@/hooks/useTripAnalytics";
import { DriverScoreCard } from "@/components/fleet/DriverScoreCard";
import { TripPlaybackDialog } from "@/components/profile/TripPlaybackDialog";
import { VehicleLocationMap } from "@/components/fleet/VehicleLocationMap";
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
  CalendarIcon,
  X,
  Filter,
  Car,
  Lock,
  Unlock,
} from "lucide-react";
import { format, parseISO, isSameDay, differenceInMinutes, subDays } from "date-fns";
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
import type { DateRange } from "react-day-picker";

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  
  // Engine control confirmation state
  const [showEngineConfirm, setShowEngineConfirm] = useState(false);
  const [pendingEngineCommand, setPendingEngineCommand] = useState<"start_engine" | "stop_engine" | null>(null);
  
  // Door lock command state
  const [pendingDoorCommand, setPendingDoorCommand] = useState<"lock" | "unlock" | null>(null);
  const [isDoorCommandPending, setIsDoorCommandPending] = useState(false);
  
  // Trip playback state
  const [selectedTrip, setSelectedTrip] = useState<VehicleTrip | null>(null);
  const [showTripPlayback, setShowTripPlayback] = useState(false);
  
  // Trip date filter state
  const [tripDateRange, setTripDateRange] = useState<DateRange | undefined>(undefined);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  
  // Build filter options for trips and events
  const tripFilterOptions: TripFilterOptions = useMemo(() => ({
    dateRange: tripDateRange?.from ? {
      from: tripDateRange.from,
      to: tripDateRange.to,
    } : undefined,
    limit: 100,
  }), [tripDateRange]);
  
  const eventFilterOptions: EventFilterOptions = useMemo(() => ({
    dateRange: tripDateRange?.from ? {
      from: tripDateRange.from,
      to: tripDateRange.to,
    } : undefined,
    limit: 100,
  }), [tripDateRange]);
  
  // Check if filter is active
  const isFilterActive = !!tripDateRange?.from;
  
  // Data fetching hooks
  const { data: vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useOwnerVehicles();
  const { data: trips, isLoading: tripsLoading, refetch: refetchTrips } = useVehicleTrips(deviceId ?? null, tripFilterOptions);
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useVehicleEvents(deviceId ?? null, eventFilterOptions);
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

  // Group trips by date
  const groupedTrips = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    
    const groups: { date: Date; label: string; trips: VehicleTrip[] }[] = [];
    const today = new Date();
    
    trips.forEach(trip => {
      const tripDate = parseISO(trip.start_time);
      const existingGroup = groups.find(g => isSameDay(g.date, tripDate));
      
      if (existingGroup) {
        existingGroup.trips.push(trip);
      } else {
        let label: string;
        if (isSameDay(tripDate, today)) {
          label = "Today";
        } else if (isSameDay(tripDate, new Date(today.getTime() - 86400000))) {
          label = "Yesterday";
        } else {
          label = format(tripDate, "EEE, MMM d");
        }
        groups.push({ date: tripDate, label, trips: [trip] });
      }
    });
    
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [trips]);

  // Get all trips count for summary
  const allTripsCount = useMemo(() => trips?.length ?? 0, [trips]);
  const allTripsDistance = useMemo(() => 
    trips?.reduce((sum, t) => sum + t.distance_km, 0) ?? 0, [trips]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    
    const groups: { date: Date; label: string; events: VehicleEvent[] }[] = [];
    const today = new Date();
    
    events.forEach(event => {
      const eventDate = parseISO(event.created_at);
      const existingGroup = groups.find(g => isSameDay(g.date, eventDate));
      
      if (existingGroup) {
        existingGroup.events.push(event);
      } else {
        let label: string;
        if (isSameDay(eventDate, today)) {
          label = "Today";
        } else if (isSameDay(eventDate, new Date(today.getTime() - 86400000))) {
          label = "Yesterday";
        } else {
          label = format(eventDate, "EEE, MMM d");
        }
        groups.push({ date: eventDate, label, events: [event] });
      }
    });
    
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events]);

  // Calculate filtered mileage stats from trips data
  const filteredMileageStats = useMemo(() => {
    if (!trips || trips.length === 0) {
      return { totalDistance: 0, totalTrips: 0, avgPerDay: 0 };
    }
    
    const totalDistance = trips.reduce((sum, t) => sum + t.distance_km, 0);
    const totalTrips = trips.length;
    
    // Calculate days in range
    let daysInRange = 1;
    if (tripDateRange?.from && tripDateRange?.to) {
      const diffTime = tripDateRange.to.getTime() - tripDateRange.from.getTime();
      daysInRange = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    } else if (!tripDateRange?.from) {
      daysInRange = 7; // Default to 7 days if no filter
    }
    
    const avgPerDay = totalDistance / daysInRange;
    
    return { totalDistance, totalTrips, avgPerDay, daysInRange };
  }, [trips, tripDateRange]);

  // Generate daily mileage data from filtered trips for chart
  const filteredDailyMileage = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    
    // Group trips by date
    const dailyData: Record<string, { distance: number; trips: number }> = {};
    
    trips.forEach(trip => {
      const dateKey = format(parseISO(trip.start_time), 'yyyy-MM-dd');
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { distance: 0, trips: 0 };
      }
      dailyData[dateKey].distance += trip.distance_km;
      dailyData[dateKey].trips += 1;
    });
    
    // Convert to array and sort by date
    return Object.entries(dailyData)
      .map(([date, data]) => ({
        day: format(parseISO(date), 'EEE'),
        date,
        distance: data.distance,
        trips: data.trips,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trips]);

  // Calculate trip stats from filtered data
  const tripStats = useMemo(() => {
    if (!isFilterActive) {
      // Use original mileage stats when no filter
      if (!mileageStats || !dailyMileage) {
        return { totalTrips: 0, avgTripsPerDay: 0, avgKmPerTrip: 0, peakTrips: 0 };
      }
      const totalTrips = mileageStats.trips_week;
      const avgTripsPerDay = totalTrips / 7;
      const avgKmPerTrip = totalTrips > 0 ? mileageStats.week / totalTrips : 0;
      const peakTrips = Math.max(...dailyMileage.map(d => d.trips), 0);
      return { totalTrips, avgTripsPerDay, avgKmPerTrip, peakTrips };
    }
    
    // Use filtered data
    const totalTrips = filteredMileageStats.totalTrips;
    const avgTripsPerDay = filteredMileageStats.daysInRange ? totalTrips / filteredMileageStats.daysInRange : 0;
    const avgKmPerTrip = totalTrips > 0 ? filteredMileageStats.totalDistance / totalTrips : 0;
    const peakTrips = Math.max(...filteredDailyMileage.map(d => d.trips), 0);
    
    return { totalTrips, avgTripsPerDay, avgKmPerTrip, peakTrips };
  }, [isFilterActive, mileageStats, dailyMileage, filteredMileageStats, filteredDailyMileage]);

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

  // Get toast for door commands
  const { toast } = useToast();

  // Door lock handlers
  const handleDoorLock = async () => {
    if (!deviceId) return;
    setIsDoorCommandPending(true);
    setPendingDoorCommand("lock");
    
    try {
      const { data, error } = await supabase.functions.invoke("execute-vehicle-command", {
        body: { device_id: deviceId, command_type: "lock", skip_confirmation: true },
      });
      
      if (error) throw error;
      
      toast({
        title: "Doors Locked",
        description: "Lock command sent to vehicle",
      });
    } catch (err) {
      toast({
        title: "Lock Failed",
        description: err instanceof Error ? err.message : "Failed to lock doors",
        variant: "destructive",
      });
    } finally {
      setIsDoorCommandPending(false);
      setPendingDoorCommand(null);
    }
  };

  const handleDoorUnlock = async () => {
    if (!deviceId) return;
    setIsDoorCommandPending(true);
    setPendingDoorCommand("unlock");
    
    try {
      const { data, error } = await supabase.functions.invoke("execute-vehicle-command", {
        body: { device_id: deviceId, command_type: "unlock", skip_confirmation: true },
      });
      
      if (error) throw error;
      
      toast({
        title: "Doors Unlocked",
        description: "Unlock command sent to vehicle",
      });
    } catch (err) {
      toast({
        title: "Unlock Failed",
        description: err instanceof Error ? err.message : "Failed to unlock doors",
        variant: "destructive",
      });
    } finally {
      setIsDoorCommandPending(false);
      setPendingDoorCommand(null);
    }
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
          {/* Vehicle Header */}
          <div className="flex flex-col items-center py-6 px-4">
            <div className="relative mb-4">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Car className="h-9 w-9 text-muted-foreground" />
              </div>
              <div
                className={cn(
                  "absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-background",
                  vehicle.status === "online"
                    ? "bg-status-active"
                    : vehicle.status === "charging"
                    ? "bg-status-maintenance"
                    : "bg-muted-foreground"
                )}
              />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{vehicle.name}</h1>
            {llmSettings?.personality_mode && (
              <p className="text-xs text-muted-foreground mt-1">
                {getPersonalityLabel(llmSettings?.personality_mode)}
              </p>
            )}
            {vehicle.lastUpdate && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Updated {format(vehicle.lastUpdate, "MMM d, HH:mm")}
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

            {/* Driver Score Card */}
            {deviceId && (
              <DriverScoreCard deviceId={deviceId} compact />
            )}

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

            {/* Door Lock Control */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-full bg-blue-500/10">
                    <Lock className="h-4 w-4 text-blue-500" />
                  </div>
                  <span className="font-medium text-foreground">Door Control</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto border-green-500/30 hover:border-green-500/50 hover:bg-green-500/5"
                    onClick={handleDoorLock}
                    disabled={isDoorCommandPending}
                  >
                    {isDoorCommandPending && pendingDoorCommand === "lock" ? (
                      <Loader2 className="h-5 w-5 mb-1 animate-spin text-green-500" />
                    ) : (
                      <Lock className="h-5 w-5 mb-1 text-green-500" />
                    )}
                    <span className="text-sm font-medium">Lock Doors</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex flex-col items-center py-4 h-auto border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-500/5"
                    onClick={handleDoorUnlock}
                    disabled={isDoorCommandPending}
                  >
                    {isDoorCommandPending && pendingDoorCommand === "unlock" ? (
                      <Loader2 className="h-5 w-5 mb-1 animate-spin text-orange-500" />
                    ) : (
                      <Unlock className="h-5 w-5 mb-1 text-orange-500" />
                    )}
                    <span className="text-sm font-medium">Unlock Doors</span>
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Remotely lock or unlock your vehicle doors
                </p>
              </CardContent>
            </Card>

            {/* Location */}
            <Card className="border-border bg-card/50 overflow-hidden">
              <div className="h-48 bg-muted relative">
                {vehicle.latitude && vehicle.longitude ? (
                  <VehicleLocationMap
                    latitude={vehicle.latitude}
                    longitude={vehicle.longitude}
                    address={currentAddress}
                    vehicleName={vehicle.name}
                    isOnline={vehicle.status === 'online'}
                    className="rounded-t-lg"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <p className="absolute bottom-4 text-sm text-muted-foreground">No GPS Signal</p>
                  </div>
                )}
                {vehicle.latitude && vehicle.longitude && (
                  <a
                    href={getGoogleMapsLink(vehicle.latitude, vehicle.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground font-mono hover:bg-background/90 transition-colors flex items-center gap-1 z-20"
                  >
                    {vehicle.latitude.toFixed(4)}°, {vehicle.longitude.toFixed(4)}°
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-12 h-8 w-8 bg-background/50 backdrop-blur-sm z-20"
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
                          <div className="text-sm text-muted-foreground truncate max-w-[220px]">
                            {addressLoading ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Fetching address...</span>
                              </span>
                            ) : currentAddress ? (
                              <span title={currentAddress}>{currentAddress}</span>
                            ) : (
                              <span className="text-muted-foreground/70">Address unavailable</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>Speed: {vehicle.speed} km/h</span>
                            {vehicle.lastUpdate && (
                              <span className="text-muted-foreground/60">
                                • {format(vehicle.lastUpdate, "HH:mm")}
                              </span>
                            )}
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
                  {isFilterActive ? (
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      <Filter className="h-3 w-3 mr-1" />
                      Filtered
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <Calendar className="h-4 w-4" />
                      All time
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <div className="text-sm text-muted-foreground">
                    {isFilterActive ? "Period Distance" : "Total Odometer"}
                  </div>
                  <div className="text-3xl font-bold text-foreground">
                    {isFilterActive 
                      ? filteredMileageStats.totalDistance.toFixed(1)
                      : vehicle.totalMileage !== null 
                        ? vehicle.totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                        : "--"
                    } <span className="text-base font-normal">km</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-purple-500/10 p-3 text-center">
                    <Route className="h-4 w-4 text-purple-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-purple-500">
                      {isFilterActive ? filteredMileageStats.totalTrips : (mileageStats?.trips_today ?? 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isFilterActive ? "Total Trips" : "Today"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">
                      {isFilterActive 
                        ? filteredMileageStats.avgPerDay.toFixed(1)
                        : ((mileageStats?.week ?? 0) / 7).toFixed(1)
                      }
                    </div>
                    <div className="text-xs text-muted-foreground">Avg km/day</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-lg font-bold text-primary">
                      {isFilterActive 
                        ? (filteredMileageStats.daysInRange || 1)
                        : (mileageStats?.week ?? 0).toFixed(1)
                      }
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isFilterActive ? "Days" : "This Week"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mileage Chart */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <span className="font-medium text-foreground">Mileage Trend</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isFilterActive 
                        ? `${filteredDailyMileage.length} day${filteredDailyMileage.length !== 1 ? 's' : ''} selected`
                        : "Last 7 days"
                      }
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      {isFilterActive 
                        ? filteredMileageStats.totalDistance.toFixed(1)
                        : (mileageStats?.week ?? 0).toFixed(1)
                      } km
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Avg: {isFilterActive 
                        ? filteredMileageStats.avgPerDay.toFixed(1)
                        : ((mileageStats?.week ?? 0) / 7).toFixed(1)
                      }/day
                    </div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={isFilterActive ? filteredDailyMileage : (dailyMileage || [])}>
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
                  <Popover open={isDateFilterOpen} onOpenChange={setIsDateFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={cn(
                          "h-8 gap-1.5 text-xs",
                          tripDateRange?.from && "border-primary text-primary"
                        )}
                      >
                        <Filter className="h-3.5 w-3.5" />
                        {tripDateRange?.from ? (
                          tripDateRange.to ? (
                            <>
                              {format(tripDateRange.from, "MMM d")} - {format(tripDateRange.to, "MMM d")}
                            </>
                          ) : (
                            format(tripDateRange.from, "MMM d, yyyy")
                          )
                        ) : (
                          "Filter dates"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <div className="p-3 border-b border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Select date range</span>
                          {tripDateRange?.from && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-xs"
                              onClick={() => {
                                setTripDateRange(undefined);
                                setIsDateFilterOpen(false);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Clear
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => {
                              setTripDateRange({ from: new Date(), to: new Date() });
                              setIsDateFilterOpen(false);
                            }}
                          >
                            Today
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => {
                              setTripDateRange({ from: subDays(new Date(), 7), to: new Date() });
                              setIsDateFilterOpen(false);
                            }}
                          >
                            Last 7 days
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => {
                              setTripDateRange({ from: subDays(new Date(), 30), to: new Date() });
                              setIsDateFilterOpen(false);
                            }}
                          >
                            Last 30 days
                          </Button>
                        </div>
                      </div>
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={tripDateRange?.from}
                        selected={tripDateRange}
                        onSelect={(range) => {
                          setTripDateRange(range);
                          if (range?.from && range?.to) {
                            setIsDateFilterOpen(false);
                          }
                        }}
                        numberOfMonths={1}
                        disabled={(date) => date > new Date()}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-4 max-h-80 overflow-y-auto">
                  {tripsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : groupedTrips.length > 0 ? (
                    groupedTrips.map((group) => (
                      <div key={group.label} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </div>
                        {group.trips.map((trip, index) => (
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
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Route className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No trips recorded yet</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total trips</span>
                  <div>
                    <span className="font-medium">{allTripsCount} trips</span>
                    <span className="text-primary ml-2">
                      {allTripsDistance.toFixed(1)} km
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
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isFilterActive 
                        ? `${filteredDailyMileage.length} day${filteredDailyMileage.length !== 1 ? 's' : ''} selected`
                        : "Last 7 days"
                      }
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-500">{tripStats.totalTrips} trips</div>
                    <div className="text-xs text-muted-foreground">
                      {isFilterActive 
                        ? filteredMileageStats.totalDistance.toFixed(1)
                        : (mileageStats?.week ?? 0).toFixed(1)
                      } km total
                    </div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={isFilterActive ? filteredDailyMileage : (dailyMileage || [])}>
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
                  {isFilterActive ? (
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      <Filter className="h-3 w-3 mr-1" />
                      Filtered
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                      <Calendar className="h-4 w-4" />
                      <span>Recent</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4 max-h-80 overflow-y-auto">
                  {eventsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : groupedEvents.length > 0 ? (
                    groupedEvents.map((group) => (
                      <div key={group.label} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </div>
                        {group.events.map((event) => (
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
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-foreground">{event.title}</div>
                                <div className="text-sm text-muted-foreground truncate">{event.message}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {format(parseISO(event.created_at), 'h:mm a')}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No alerts recorded</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total alerts</span>
                  <div>
                    <span className="font-medium">{events?.length ?? 0}</span>
                    <span className="text-yellow-500 ml-2">
                      {events?.filter(a => a.severity === 'warning' || a.severity === 'error').length ?? 0} warnings
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
