import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Gauge,
  Route,
  TrendingUp,
  Calendar,
  Filter,
  Fuel,
  AlertTriangle,
  TrendingDown,
  TrendingUp as TrendingUpIcon,
  Clock,
  Car,
  ParkingCircle,
  Zap,
} from "lucide-react";
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
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { VehicleDailyStats } from "@/hooks/useVehicleProfile";
import { deriveMileageFromStats, useVehicleMileageDetails } from "@/hooks/useVehicleProfile";

interface MileageSectionProps {
  deviceId: string;
  totalMileage: number | null;
  dailyStats: VehicleDailyStats[] | undefined;
  mileageStats: {
    today: number;
    week: number;
    trips_today: number;
  } | null | undefined;
  dailyMileage: { day: string; distance: number; trips: number }[] | undefined;
  dateRange: DateRange | undefined;
}

export function MileageSection({
  deviceId,
  totalMileage,
  dailyStats,
  mileageStats,
  dailyMileage,
  dateRange,
}: MileageSectionProps) {
  const isFilterActive = !!dateRange?.from;
  
  // Fetch mileage details for fuel consumption
  const startDate = dateRange?.from?.toISOString().split('T')[0];
  const endDate = dateRange?.to?.toISOString().split('T')[0];
  const { data: mileageDetails, error: mileageError } = useVehicleMileageDetails(
    deviceId,
    startDate,
    endDate,
    true
  );
  
  // Handle case where table doesn't exist yet (migration not applied)
  const hasMileageData = mileageDetails && mileageDetails.length > 0 && !mileageError;

  // Derive stats from daily data (Single Source of Truth)
  const derivedStats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return deriveMileageFromStats([]);
    }
    
    if (dateRange?.from) {
      const fromDate = dateRange.from.toISOString().split('T')[0];
      const toDate = dateRange.to?.toISOString().split('T')[0] || fromDate;
      
      const filtered = dailyStats.filter(s => {
        const date = s.stat_date;
        return date >= fromDate && date <= toDate;
      });
      
      return deriveMileageFromStats(filtered);
    }
    
    return deriveMileageFromStats(dailyStats);
  }, [dailyStats, dateRange]);

  // Calculate today and this week stats from dailyStats (unified source)
  const todayAndWeekStats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return { todayTrips: 0, todayDistance: 0, weekTrips: 0, weekDistance: 0 };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    
    // Today's stats
    const todayStat = dailyStats.find(s => s.stat_date === today);
    const todayTrips = todayStat?.trip_count || 0;
    const todayDistance = todayStat ? Number(todayStat.total_distance_km) : 0;
    
    // Last 7 days stats
    const weekStats = dailyStats.filter(s => s.stat_date >= weekAgoStr && s.stat_date <= today);
    const weekTrips = weekStats.reduce((sum, s) => sum + s.trip_count, 0);
    const weekDistance = weekStats.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
    
    return { todayTrips, todayDistance, weekTrips, weekDistance };
  }, [dailyStats]);

  // Convert daily stats to chart data
  const chartData = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) return [];
    
    let filtered = dailyStats;
    if (dateRange?.from) {
      const fromDate = dateRange.from.toISOString().split('T')[0];
      const toDate = dateRange.to?.toISOString().split('T')[0] || fromDate;
      filtered = dailyStats.filter(s => s.stat_date >= fromDate && s.stat_date <= toDate);
    }
    
    return filtered
      .map(stat => ({
        day: format(parseISO(stat.stat_date), 'EEE'),
        date: stat.stat_date,
        distance: Number(stat.total_distance_km),
        trips: stat.trip_count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyStats, dateRange]);

  // Trip stats calculation
  const tripStats = useMemo(() => {
    const { totalTrips, avgPerDay, avgKmPerTrip, daysWithData } = derivedStats;
    const peakTrips = chartData.length > 0 ? Math.max(...chartData.map(d => d.trips)) : 0;
    
    return {
      totalTrips,
      avgTripsPerDay: daysWithData > 0 ? totalTrips / daysWithData : 0,
      avgKmPerTrip,
      peakTrips,
    };
  }, [derivedStats, chartData]);

  // Use chartData consistently to prevent UI jumping
  const displayData = chartData.length > 0 ? chartData : [];

  // Calculate driving stats (driving time, parking time, max/avg speed)
  // These match the GPS51 platform display
  const drivingStats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return {
        totalDrivingSeconds: 0,
        drivingTimeFormatted: "0h 0m",
        parkingTimeFormatted: "--",
        maxSpeed: 0,
        avgSpeed: 0,
        hasDrivingData: false,
      };
    }

    let filtered = dailyStats;
    const today = new Date().toISOString().split('T')[0];

    if (dateRange?.from) {
      // Use the selected date range
      const fromDate = dateRange.from.toISOString().split('T')[0];
      const toDate = dateRange.to?.toISOString().split('T')[0] || fromDate;
      filtered = dailyStats.filter(s => s.stat_date >= fromDate && s.stat_date <= toDate);
    } else {
      // When no filter is active, show TODAY's data only (to match GPS51 behavior)
      const todayStat = dailyStats.find(s => s.stat_date === today);
      filtered = todayStat ? [todayStat] : [];
    }

    if (filtered.length === 0) {
      return {
        totalDrivingSeconds: 0,
        drivingTimeFormatted: "0h 0m",
        parkingTimeFormatted: "--",
        maxSpeed: 0,
        avgSpeed: 0,
        hasDrivingData: false,
      };
    }

    // Total driving time in seconds
    const totalDrivingSeconds = filtered.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);

    // Peak speed across all days
    const maxSpeed = Math.max(...filtered.map(s => s.peak_speed || 0), 0);

    // Average speed (weighted by duration would be ideal, but we'll use simple average)
    const speedValues = filtered.filter(s => s.avg_speed && s.avg_speed > 0).map(s => s.avg_speed || 0);
    const avgSpeed = speedValues.length > 0 ? speedValues.reduce((a, b) => a + b, 0) / speedValues.length : 0;

    // Format driving time as hours and minutes
    const drivingHours = Math.floor(totalDrivingSeconds / 3600);
    const drivingMinutes = Math.floor((totalDrivingSeconds % 3600) / 60);
    const drivingTimeFormatted = `${drivingHours}h ${drivingMinutes}m`;

    // Calculate parking time: For single day, it's 24h - driving time
    // For multiple days, it's (total days * 24h) - driving time
    const daysCount = filtered.length || 1;
    const totalPeriodSeconds = daysCount * 24 * 3600;
    const parkingSeconds = Math.max(0, totalPeriodSeconds - totalDrivingSeconds);
    const parkingHours = Math.floor(parkingSeconds / 3600);
    const parkingMinutes = Math.floor((parkingSeconds % 3600) / 60);
    const parkingTimeFormatted = `${parkingHours}h ${parkingMinutes}m`;

    return {
      totalDrivingSeconds,
      drivingTimeFormatted,
      parkingTimeFormatted,
      maxSpeed: Math.round(maxSpeed),
      avgSpeed: Math.round(avgSpeed),
      hasDrivingData: totalDrivingSeconds > 0 || maxSpeed > 0,
    };
  }, [dailyStats, dateRange]);

  // Calculate fuel consumption statistics (only if table exists and has data)
  const fuelStats = useMemo(() => {
    // Check if table exists - if error is PGRST205, table doesn't exist
    const tableExists = !mileageError || (mileageError as any)?.code !== 'PGRST205';
    if (!tableExists || !mileageDetails || mileageDetails.length === 0) return null;

    const withActual = mileageDetails.filter(m => m.oilper100km !== null);
    const withEstimated = mileageDetails.filter(m => m.estimated_fuel_consumption_combined !== null);
    const withBoth = mileageDetails.filter(
      m => m.oilper100km !== null && m.estimated_fuel_consumption_combined !== null
    );

    const avgActual = withActual.length > 0
      ? withActual.reduce((sum, m) => sum + (m.oilper100km || 0), 0) / withActual.length
      : null;

    const avgEstimated = withEstimated.length > 0
      ? withEstimated.reduce((sum, m) => sum + (m.estimated_fuel_consumption_combined || 0), 0) / withEstimated.length
      : null;

    const avgVariance = withBoth.length > 0
      ? withBoth.reduce((sum, m) => sum + (m.fuel_consumption_variance || 0), 0) / withBoth.length
      : null;

    const theftAlerts = mileageDetails.filter(m => m.leakoil && m.leakoil > 0).length;

    return {
      avgActual,
      avgEstimated,
      avgVariance,
      theftAlerts,
      hasData: withActual.length > 0,
      hasEstimates: withEstimated.length > 0,
    };
  }, [mileageDetails, mileageError]);

  return (
    <>
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
                Last 30 Days
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="text-sm text-muted-foreground">
              {isFilterActive ? "Period Distance" : "Total Odometer"}
            </div>
            <div className="text-3xl font-bold text-foreground">
              {/* DEFENSIVE FIX: Check strictly for number type */}
              {isFilterActive 
                ? derivedStats.totalDistance.toFixed(1)
                : typeof totalMileage === 'number' 
                  ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 }) 
                  : "--"
              } <span className="text-base font-normal">km</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-purple-500/10 p-3 text-center">
              <Route className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-purple-500">
                {isFilterActive ? derivedStats.totalTrips : todayAndWeekStats.todayTrips}
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive ? "Total Trips" : "Today"}
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">
                {isFilterActive
                  ? derivedStats.avgPerDay.toFixed(1)
                  : (todayAndWeekStats.weekDistance / 7).toFixed(1)
                }
              </div>
              <div className="text-xs text-muted-foreground">Avg km/day</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-primary">
                {isFilterActive
                  ? (derivedStats.daysWithData || 1)
                  : todayAndWeekStats.weekDistance.toFixed(1)
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive ? "Days" : "This Week"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Driving Stats Card - GPS51 Parity */}
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Driving Stats</span>
            </div>
            {isFilterActive ? (
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                <Filter className="h-3 w-3 mr-1" />
                Filtered
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Calendar className="h-4 w-4" />
                Today
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Driving Time */}
            <div className="rounded-lg bg-green-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Driving</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.drivingTimeFormatted}
              </div>
            </div>

            {/* Parking Duration */}
            <div className="rounded-lg bg-orange-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ParkingCircle className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">Parking</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.parkingTimeFormatted}
              </div>
            </div>

            {/* Max Speed */}
            <div className="rounded-lg bg-red-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Max Speed</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.maxSpeed > 0 ? `${drivingStats.maxSpeed} km/h` : "--"}
              </div>
            </div>

            {/* Avg Speed */}
            <div className="rounded-lg bg-blue-500/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Avg Speed</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.avgSpeed > 0 ? `${drivingStats.avgSpeed} km/h` : "--"}
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
                  ? `${chartData.length} day${chartData.length !== 1 ? 's' : ''} selected`
                  : "Last 30 days"
                }
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-primary">
                {derivedStats.totalDistance.toFixed(1)} km
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: {derivedStats.avgPerDay.toFixed(1)}/day
              </div>
            </div>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayData}>
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
                  cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "#FFFFFF",
                  }}
                  formatter={(value: number) => [`${typeof value === 'number' ? value.toFixed(1) : 0} km`, 'Distance']}
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
                  ? `${chartData.length} day${chartData.length !== 1 ? 's' : ''} selected`
                  : "Last 30 days"
                }
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-purple-500">{tripStats.totalTrips} trips</div>
              <div className="text-xs text-muted-foreground">
                {derivedStats.totalDistance.toFixed(1)} km total
              </div>
            </div>
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayData}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "#FFFFFF",
                  }}
                  formatter={(value: number) => [`${value} trips`, 'Trips']}
                />
                <Bar
                  dataKey="trips"
                  fill="hsl(var(--background))"
                  stroke="#FFFFFF"
                  radius={[4, 4, 0, 0]}
                />
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
    </>
  );
}
