import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  Route,
  TrendingUp,
  Calendar,
  Filter,
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
import { deriveMileageFromStats } from "@/hooks/useVehicleProfile";

interface MileageSectionProps {
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
  totalMileage,
  dailyStats,
  mileageStats,
  dailyMileage,
  dateRange,
}: MileageSectionProps) {
  const isFilterActive = !!dateRange?.from;

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
                {isFilterActive ? derivedStats.totalTrips : (mileageStats?.trips_today ?? 0)}
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
                  : ((mileageStats?.week ?? 0) / 7).toFixed(1)
                }
              </div>
              <div className="text-xs text-muted-foreground">Avg km/day</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-primary">
                {isFilterActive 
                  ? (derivedStats.daysWithData || 1)
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
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
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
    </>
  );
}
