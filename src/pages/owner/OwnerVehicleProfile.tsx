import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
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
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, isSameDay, parseISO } from "date-fns";
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

// Haversine formula to calculate distance between two GPS points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

interface PositionRecord {
  gps_time: string | null;
  speed: number | null;
  latitude: number | null;
  longitude: number | null;
  ignition_on: boolean | null;
  battery_percent: number | null;
}

interface Trip {
  startTime: Date;
  endTime: Date;
  distance: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}

interface DayStats {
  day: string;
  date: Date;
  distance: number;
  trips: number;
}

interface Alert {
  id: string;
  type: 'overspeed' | 'low_battery' | 'ignition_on' | 'ignition_off';
  message: string;
  detail: string;
  time: Date;
  severity: 'warning' | 'info';
}

// Fetch position history for mileage and trip calculations
async function fetchVehicleHistory(deviceId: string) {
  const thirtyDaysAgo = subDays(new Date(), 30);
  
  const { data: history, error } = await supabase
    .from("position_history")
    .select("gps_time, speed, latitude, longitude, ignition_on, battery_percent")
    .eq("device_id", deviceId)
    .gte("gps_time", thirtyDaysAgo.toISOString())
    .order("gps_time", { ascending: true });

  if (error) throw error;
  return (history || []) as PositionRecord[];
}

// Process history data to extract trips and daily stats
function processHistoryData(history: PositionRecord[]) {
  if (!history || history.length === 0) {
    return {
      trips: [] as Trip[],
      dailyStats: [] as DayStats[],
      alerts: [] as Alert[],
      totalDistance: 0,
    };
  }

  const trips: Trip[] = [];
  const alerts: Alert[] = [];
  let currentTrip: { start: PositionRecord; points: PositionRecord[] } | null = null;
  let totalDistance = 0;
  
  // Daily aggregation
  const dailyMap = new Map<string, { distance: number; trips: Set<string> }>();
  
  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const key = format(date, 'yyyy-MM-dd');
    dailyMap.set(key, { distance: 0, trips: new Set() });
  }

  for (let i = 0; i < history.length; i++) {
    const point = history[i];
    const prevPoint = i > 0 ? history[i - 1] : null;
    
    if (!point.gps_time || point.latitude === null || point.longitude === null) continue;
    
    const pointDate = parseISO(point.gps_time);
    const dayKey = format(pointDate, 'yyyy-MM-dd');
    
    // Calculate distance from previous point
    if (prevPoint && prevPoint.latitude !== null && prevPoint.longitude !== null) {
      const dist = calculateDistance(
        prevPoint.latitude, prevPoint.longitude,
        point.latitude, point.longitude
      );
      
      // Filter out GPS jumps (unrealistic distances > 50km in short time)
      if (dist < 50) {
        totalDistance += dist;
        
        // Add to daily stats
        if (dailyMap.has(dayKey)) {
          dailyMap.get(dayKey)!.distance += dist;
        }
      }
    }
    
    // Detect trips based on ignition changes or speed patterns
    const isMoving = (point.speed ?? 0) > 2;
    const wasMoving = prevPoint && (prevPoint.speed ?? 0) > 2;
    
    // Start new trip
    if (isMoving && !wasMoving && !currentTrip) {
      currentTrip = { start: point, points: [point] };
    }
    
    // Continue trip
    if (currentTrip && isMoving) {
      currentTrip.points.push(point);
    }
    
    // End trip (stopped for a while)
    if (currentTrip && !isMoving && wasMoving) {
      const lastPoint = currentTrip.points[currentTrip.points.length - 1];
      if (lastPoint && currentTrip.points.length >= 3) {
        // Calculate trip distance
        let tripDistance = 0;
        for (let j = 1; j < currentTrip.points.length; j++) {
          const p1 = currentTrip.points[j - 1];
          const p2 = currentTrip.points[j];
          if (p1.latitude && p1.longitude && p2.latitude && p2.longitude) {
            tripDistance += calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
          }
        }
        
        // Only count meaningful trips (> 0.5km)
        if (tripDistance > 0.5) {
          const trip: Trip = {
            startTime: parseISO(currentTrip.start.gps_time!),
            endTime: parseISO(lastPoint.gps_time!),
            distance: tripDistance,
            startLat: currentTrip.start.latitude!,
            startLon: currentTrip.start.longitude!,
            endLat: lastPoint.latitude!,
            endLon: lastPoint.longitude!,
          };
          trips.push(trip);
          
          // Track trips per day
          const tripDayKey = format(trip.startTime, 'yyyy-MM-dd');
          if (dailyMap.has(tripDayKey)) {
            dailyMap.get(tripDayKey)!.trips.add(`${trip.startTime.getTime()}`);
          }
        }
      }
      currentTrip = null;
    }
    
    // Detect alerts
    if (point.speed !== null && point.speed > 120) {
      alerts.push({
        id: `overspeed-${point.gps_time}`,
        type: 'overspeed',
        message: 'Overspeeding Detected',
        detail: `Speed: ${point.speed.toFixed(0)} km/h`,
        time: pointDate,
        severity: 'warning',
      });
    }
    
    if (point.battery_percent !== null && point.battery_percent < 20 && point.battery_percent > 0) {
      // Only add one low battery alert per hour
      const existingLowBattery = alerts.find(a => 
        a.type === 'low_battery' && 
        Math.abs(a.time.getTime() - pointDate.getTime()) < 3600000
      );
      if (!existingLowBattery) {
        alerts.push({
          id: `low_battery-${point.gps_time}`,
          type: 'low_battery',
          message: 'Low Battery Warning',
          detail: `Battery: ${point.battery_percent}%`,
          time: pointDate,
          severity: 'warning',
        });
      }
    }
    
    // Ignition alerts
    if (prevPoint && point.ignition_on !== prevPoint.ignition_on && point.ignition_on !== null) {
      alerts.push({
        id: `ignition-${point.gps_time}`,
        type: point.ignition_on ? 'ignition_on' : 'ignition_off',
        message: point.ignition_on ? 'Engine Started' : 'Engine Stopped',
        detail: `At ${format(pointDate, 'HH:mm')}`,
        time: pointDate,
        severity: 'info',
      });
    }
  }

  // Convert daily map to array
  const dailyStats: DayStats[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 6; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const key = format(date, 'yyyy-MM-dd');
    const stats = dailyMap.get(key);
    dailyStats.push({
      day: dayNames[date.getDay()],
      date,
      distance: stats?.distance ?? 0,
      trips: stats?.trips.size ?? 0,
    });
  }

  // Sort alerts by time (most recent first) and limit
  alerts.sort((a, b) => b.time.getTime() - a.time.getTime());
  const recentAlerts = alerts.slice(0, 10);

  return {
    trips: trips.slice(-20), // Last 20 trips
    dailyStats,
    alerts: recentAlerts,
    totalDistance,
  };
}

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { data: vehicles, isLoading: vehiclesLoading, refetch: refetchVehicles } = useOwnerVehicles();
  

  const vehicle = vehicles?.find((v) => v.deviceId === deviceId);

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["vehicle-history", deviceId],
    queryFn: () => fetchVehicleHistory(deviceId!),
    enabled: !!deviceId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const isLoading = vehiclesLoading || historyLoading;

  // Process history data
  const processedData = useMemo(() => {
    if (!history) return null;
    return processHistoryData(history);
  }, [history]);

  // Calculate mileage stats
  const mileageStats = useMemo(() => {
    if (!processedData) {
      return { today: 0, week: 0, month: 0, avgPerDay: 0 };
    }
    
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    
    const todayStats = processedData.dailyStats.find(d => format(d.date, 'yyyy-MM-dd') === todayKey);
    const weekTotal = processedData.dailyStats.reduce((sum, d) => sum + d.distance, 0);
    const avgPerDay = weekTotal / 7;
    
    return {
      today: todayStats?.distance ?? 0,
      week: weekTotal,
      month: processedData.totalDistance,
      avgPerDay,
    };
  }, [processedData]);

  // Today's trips
  const todaysTrips = useMemo(() => {
    if (!processedData) return [];
    const today = new Date();
    return processedData.trips.filter(t => isSameDay(t.startTime, today));
  }, [processedData]);

  // Today's alerts
  const todaysAlerts = useMemo(() => {
    if (!processedData) return [];
    const today = new Date();
    return processedData.alerts.filter(a => isSameDay(a.time, today));
  }, [processedData]);

  // Trip stats
  const tripStats = useMemo(() => {
    if (!processedData) return { totalTrips: 0, avgTripsPerDay: 0, avgKmPerTrip: 0, peakTrips: 0 };
    
    const totalTrips = processedData.dailyStats.reduce((sum, d) => sum + d.trips, 0);
    const avgTripsPerDay = totalTrips / 7;
    const avgKmPerTrip = totalTrips > 0 ? mileageStats.week / totalTrips : 0;
    const peakTrips = Math.max(...processedData.dailyStats.map(d => d.trips));
    
    return { totalTrips, avgTripsPerDay, avgKmPerTrip, peakTrips };
  }, [processedData, mileageStats]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchVehicles(), refetchHistory()]);
  }, [refetchVehicles, refetchHistory]);

  // Pull-to-refresh hook
  const { pullDistance, isRefreshing: isPullRefreshing, handlers } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  // Get battery status label
  const getBatteryStatus = (battery: number | null) => {
    if (battery === null) return "Unknown";
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
              <span>✨</span> {vehicle.personality || "Enthusiastic & Adventurous"}
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
                >
                  <Power className="h-4 w-4 mr-2" />
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
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-2xl">🚗</span>
                  </div>
                </div>
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
                    <div>
                      <div className="font-medium text-foreground">Current Location</div>
                      <div className="text-sm text-muted-foreground">
                        {vehicle.latitude && vehicle.longitude ? (
                          <span>Speed: {vehicle.speed} km/h</span>
                        ) : "No GPS Signal"}
                      </div>
                    </div>
                  </div>
                  {vehicle.latitude && vehicle.longitude && (
                    <a
                      href={getGoogleMapsLink(vehicle.latitude, vehicle.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-sm transition-all hover:scale-105"
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
                      {mileageStats.today.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Today</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <Calendar className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">
                      {mileageStats.week.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">This Week</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-lg font-bold text-primary">
                      {mileageStats.month.toFixed(1)}
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
                    <div className="text-lg font-bold text-primary">{mileageStats.week.toFixed(1)} km</div>
                    <div className="text-xs text-muted-foreground">Avg: {mileageStats.avgPerDay.toFixed(1)}/day</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={processedData?.dailyStats || []}>
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
                  {todaysTrips.length > 0 ? (
                    todaysTrips.slice(0, 5).map((trip, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Trip {index + 1}</span>
                            <a
                              href={getGoogleMapsLink(trip.endLat, trip.endLon)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(trip.startTime, 'h:mm a')} - {format(trip.endTime, 'h:mm a')}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm">{trip.distance.toFixed(1)} km</div>
                          <div className="text-xs text-green-500">
                            {differenceInMinutes(trip.endTime, trip.startTime)} min
                          </div>
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
                      {todaysTrips.reduce((sum, t) => sum + t.distance, 0).toFixed(1)} km
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
                    <div className="text-xs text-muted-foreground">{mileageStats.week.toFixed(1)} km total</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={processedData?.dailyStats || []}>
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
                  {todaysAlerts.length > 0 ? (
                    todaysAlerts.slice(0, 5).map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          "p-3 rounded-lg",
                          alert.severity === 'warning' ? "bg-yellow-500/10" : "bg-muted/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {alert.type === 'overspeed' ? (
                            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                          ) : alert.type === 'low_battery' ? (
                            <Battery className="h-4 w-4 text-orange-500 mt-0.5" />
                          ) : alert.type === 'ignition_on' ? (
                            <Zap className="h-4 w-4 text-green-500 mt-0.5" />
                          ) : (
                            <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                          )}
                          <div>
                            <div className="font-medium text-foreground">{alert.message}</div>
                            <div className="text-sm text-muted-foreground">{alert.detail}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(alert.time, 'h:mm a')}
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
                      {todaysAlerts.filter(a => a.severity === 'warning').length} warnings
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
    </div>
  );
}
