import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerVehicles } from "@/hooks/useOwnerVehicles";
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
  Check,
  RefreshCw,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
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

// Fetch position history for mileage calculations
async function fetchVehicleStats(deviceId: string) {
  const sevenDaysAgo = subDays(new Date(), 7);
  
  const { data: history, error } = await supabase
    .from("position_history")
    .select("gps_time, speed, latitude, longitude")
    .eq("device_id", deviceId)
    .gte("gps_time", sevenDaysAgo.toISOString())
    .order("gps_time", { ascending: true });

  if (error) throw error;
  return history || [];
}

export default function OwnerVehicleProfile() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { data: vehicles, isLoading: vehiclesLoading } = useOwnerVehicles();
  const [activeSection, setActiveSection] = useState<"status" | "location" | "mileage" | "trips" | "alerts">("status");

  const vehicle = vehicles?.find((v) => v.deviceId === deviceId);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["vehicle-stats", deviceId],
    queryFn: () => fetchVehicleStats(deviceId!),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = vehiclesLoading || statsLoading;

  // Generate mock data for charts (in production, calculate from position_history)
  const weeklyMileageData = [
    { day: "Sun", value: 15 },
    { day: "Mon", value: 25 },
    { day: "Tue", value: 45 },
    { day: "Wed", value: 35 },
    { day: "Thu", value: 40 },
    { day: "Fri", value: 10 },
    { day: "Sat", value: 30 },
  ];

  const tripActivityData = [
    { day: "Sun", trips: 1 },
    { day: "Mon", trips: 1 },
    { day: "Tue", trips: 3 },
    { day: "Wed", trips: 2 },
    { day: "Thu", trips: 2 },
    { day: "Fri", trips: 2 },
    { day: "Sat", trips: 3 },
  ];

  const totalMileageToday = 30.5;
  const totalMileageWeek = 86;
  const totalMileageMonth = 86;

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

      <ScrollArea className="flex-1">
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
              <span>✨</span> Enthusiastic & Adventurous
            </p>
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
                  <div className="text-2xl font-bold text-green-500">
                    {vehicle.battery ?? "--"}%
                  </div>
                  <div className="text-xs text-muted-foreground">Optimal</div>
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
                    {vehicle.totalMileage?.toLocaleString() ?? "--"} <span className="text-sm font-normal">km</span>
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
                  <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground font-mono">
                    {vehicle.latitude.toFixed(4)}°N, {vehicle.longitude.toFixed(4)}°W
                  </div>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-8 w-8 bg-background/50 backdrop-blur-sm"
                >
                  <RefreshCw className="h-4 w-4" />
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
                        {vehicle.latitude && vehicle.longitude ? "GPS Active" : "No GPS Signal"}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-500 border-green-500/50">
                    <Navigation className="h-3 w-3 mr-1" />
                    LIVE
                  </Badge>
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
                    {vehicle.totalMileage?.toLocaleString() ?? "12,450"} <span className="text-base font-normal">km</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-purple-500/10 p-3 text-center">
                    <TrendingUp className="h-4 w-4 text-purple-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-purple-500">{totalMileageToday}</div>
                    <div className="text-xs text-muted-foreground">Today</div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <Calendar className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <div className="text-lg font-bold text-foreground">{totalMileageWeek}</div>
                    <div className="text-xs text-muted-foreground">This Week</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3 text-center">
                    <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
                    <div className="text-lg font-bold text-primary">{totalMileageMonth}</div>
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
                    <div className="text-lg font-bold text-primary">181 km</div>
                    <div className="text-xs text-muted-foreground">Avg: 25.9/day</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyMileageData}>
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
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
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
                  {/* Sample trips */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Home</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm font-medium">Downtown Office</span>
                        <MapPin className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        8:30 AM - 9:15 AM
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm">12.5 km</div>
                      <div className="text-xs text-green-500">45 min</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Downtown Office</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm font-medium">Coffee Shop</span>
                        <MapPin className="h-3 w-3 text-destructive" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        12:00 PM - 12:20 PM
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm">3.2 km</div>
                      <div className="text-xs text-green-500">20 min</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total trips</span>
                  <div>
                    <span className="font-medium">3 trips</span>
                    <span className="text-primary ml-2">30.5 km</span>
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
                    <div className="text-lg font-bold text-purple-500">13 trips</div>
                    <div className="text-xs text-muted-foreground">102 km total</div>
                  </div>
                </div>

                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tripActivityData}>
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
                      />
                      <Bar dataKey="trips" fill="hsl(270, 70%, 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">1.9</div>
                    <div className="text-xs text-muted-foreground">Avg trips/day</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-500">3</div>
                    <div className="text-xs text-muted-foreground">Peak trips</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-primary">7.8</div>
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
                  <div className="p-3 rounded-lg bg-blue-500/10">
                    <div className="flex items-start gap-3">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                      <div>
                        <div className="font-medium text-foreground">Software Update Available</div>
                        <div className="text-sm text-muted-foreground">Version 2024.12.1 is ready to install</div>
                        <div className="text-xs text-muted-foreground mt-1">10:30 AM</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-start gap-3">
                      <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">Charging Complete</div>
                        <div className="text-sm text-muted-foreground">Battery reached 100%</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">3:15 PM</span>
                          <Badge variant="outline" className="text-green-500 border-green-500/50 text-xs">
                            <Check className="h-3 w-3 mr-1" />
                            Resolved
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total alerts</span>
                  <div>
                    <span className="font-medium">2</span>
                    <span className="text-green-500 ml-2">1 resolved</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Mood */}
            <Card className="border-border bg-card/50">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground mb-2">Current Mood</div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <span className="text-2xl">😊</span>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Happy</div>
                    <div className="text-sm text-muted-foreground">Ready for anything!</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
