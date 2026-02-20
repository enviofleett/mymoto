import { useMemo } from "react";
import { differenceInCalendarDays, endOfDay, isToday, startOfDay } from "date-fns";
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
import type { DateRange } from "react-day-picker";
import { formatLagos } from "@/lib/timezone";
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

  const dateRangeLabel = getDateRangeLabel(dateRange);

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
        day: formatLagos(stat.stat_date, 'EEE'),
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
      <Card className="border-border bg-card/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Driving Stats</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {dateRangeLabel}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Driving Time */}
            <div className="rounded-lg bg-card/70 border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Driving</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.drivingTimeFormatted}
              </div>
            </div>

            {/* Parking Duration */}
            <div className="rounded-lg bg-card/70 border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ParkingCircle className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">Parking</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.parkingTimeFormatted}
              </div>
            </div>

            {/* Max Speed */}
            <div className="rounded-lg bg-card/70 border border-border/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted-foreground">Max Speed</span>
              </div>
              <div className="text-xl font-bold text-white">
                {drivingStats.maxSpeed > 0 ? `${drivingStats.maxSpeed} km/h` : "--"}
              </div>
            </div>

            {/* Avg Speed */}
            <div className="rounded-lg bg-card/70 border border-border/60 p-3">
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

      {fuelStats && (
        <Card className="border-border bg-card/50 mt-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Fuel className="h-5 w-5 text-primary" />
                  <span className="font-medium text-foreground">Fuel Stats</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {dateRangeLabel}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-card/70 border border-border/60 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">Avg Consumption</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {fuelStats.avgActual !== null && fuelStats.avgActual !== undefined
                    ? `${fuelStats.avgActual.toFixed(1)} L/100km`
                    : fuelStats.avgEstimated !== null && fuelStats.avgEstimated !== undefined
                    ? `${fuelStats.avgEstimated.toFixed(1)} L/100km`
                    : "--"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {fuelStats.avgVariance !== null && fuelStats.avgVariance !== undefined
                    ? (() => {
                        const percent = Math.round(fuelStats.avgVariance);
                        if (percent > 0) return `About ${percent}% above rated`;
                        if (percent < 0) return `About ${Math.abs(percent)}% better than rated`;
                        return "In line with rated";
                      })()
                    : fuelStats.hasData
                    ? "Based on GPS data"
                    : fuelStats.hasEstimates
                    ? "Manufacturer estimate"
                    : "No fuel data yet"}
                </div>
              </div>

              <div className="rounded-lg bg-card/70 border border-border/60 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-xs text-muted-foreground">Fuel Theft Alerts</span>
                </div>
                <div className="text-xl font-bold text-white">
                  {fuelStats.theftAlerts > 0 ? fuelStats.theftAlerts : 0}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {fuelStats.theftAlerts > 0
                    ? "Potential fuel loss detected in this period"
                    : "No fuel theft detected in this period"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function getDateRangeLabel(dateRange: DateRange | undefined): string {
  if (!dateRange?.from || !dateRange.to) {
    return "All time";
  }

  const from = startOfDay(dateRange.from);
  const to = endOfDay(dateRange.to);
  const days = differenceInCalendarDays(to, from) + 1;

  const toIsToday = isToday(to);

  if (days === 1) {
    return formatLagos(from, "dd MMM yyyy");
  }

  if (toIsToday && days === 7) {
    return "Last 7 days";
  }

  if (toIsToday && days === 30) {
    return "Last 30 days";
  }

  const sameYear = from.getFullYear() === to.getFullYear();

  if (sameYear) {
    const fromLabel = formatLagos(from, "dd MMM");
    const toLabel = formatLagos(to, "dd MMM yyyy");
    return `${fromLabel} – ${toLabel}`;
  }

  const fromLabel = formatLagos(from, "dd MMM yyyy");
  const toLabel = formatLagos(to, "dd MMM yyyy");
  return `${fromLabel} – ${toLabel}`;
}
