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
  dateRange: DateRange | undefined;
}

export function MileageSection({
  deviceId,
  totalMileage,
  dailyStats,
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

  // ✅ SINGLE SOURCE OF TRUTH - Derive all stats from dailyStats
  const stats = useMemo(() => {
    if (!dailyStats || dailyStats.length === 0) {
      return {
        todayDistance: 0,
        todayTrips: 0,
        weekDistance: 0,
        weekTrips: 0,
        avgPerDay: 0,
        totalDistance: 0,
        totalTrips: 0,
        daysWithData: 0,
        peakSpeed: 0,
        avgKmPerTrip: 0,
      };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    // Apply date filter if provided
    let filtered = dailyStats;
    if (dateRange?.from) {
      const fromStr = dateRange.from.toISOString().split('T')[0];
      const toStr = dateRange.to?.toISOString().split('T')[0] || fromStr;
      filtered = dailyStats.filter(s => s.stat_date >= fromStr && s.stat_date <= toStr);
    }

    // Calculate today's stats
    const todayStat = dailyStats.find(s => s.stat_date === today);

    // Calculate week's stats (last 7 days)
    const weekStats = dailyStats.filter(s => s.stat_date >= weekAgoStr);

    // Calculate filtered period stats
    const totalDistance = filtered.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
    const totalTrips = filtered.reduce((sum, s) => sum + s.trip_count, 0);
    const weekDistance = weekStats.reduce((sum, s) => sum + Number(s.total_distance_km), 0);
    const weekTrips = weekStats.reduce((sum, s) => sum + s.trip_count, 0);
    const peakSpeed = Math.max(...filtered.map(s => s.peak_speed || 0));

    return {
      todayDistance: todayStat ? Number(todayStat.total_distance_km) : 0,
      todayTrips: todayStat ? todayStat.trip_count : 0,
      weekDistance,
      weekTrips,
      avgPerDay: filtered.length > 0 ? totalDistance / filtered.length : 0,
      totalDistance,
      totalTrips,
      daysWithData: filtered.length,
      peakSpeed,
      avgKmPerTrip: totalTrips > 0 ? totalDistance / totalTrips : 0,
    };
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

  const displayData = chartData.length > 0 ? chartData : [];

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
      {/* Fuel Consumption Card - Only show if table exists and has data */}
      {fuelStats && fuelStats.hasData && (
        <Card className="border-border bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Fuel className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground">Fuel Consumption</span>
              </div>
              {fuelStats.theftAlerts > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {fuelStats.theftAlerts} Theft Alert{fuelStats.theftAlerts !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              {/* Actual Consumption */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Actual (GPS51 measured)</div>
                  <div className="text-2xl font-bold text-foreground">
                    {fuelStats.avgActual?.toFixed(2) || '--'} <span className="text-sm font-normal">L/100km</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Avg Efficiency</div>
                  <div className="text-sm font-medium text-green-600">
                    {fuelStats.avgActual ? `${(100 / fuelStats.avgActual).toFixed(1)} km/L` : '--'}
                  </div>
                </div>
              </div>

              {/* Estimated Consumption */}
              {fuelStats.hasEstimates && fuelStats.avgEstimated && (
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div>
                    <div className="text-xs text-muted-foreground">Estimated (Manufacturer + Age)</div>
                    <div className="text-2xl font-bold text-primary">
                      {fuelStats.avgEstimated.toFixed(2)} <span className="text-sm font-normal">L/100km</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Based on specs</div>
                    <div className="text-sm font-medium text-primary">
                      {fuelStats.avgEstimated ? `${(100 / fuelStats.avgEstimated).toFixed(1)} km/L` : '--'}
                    </div>
                  </div>
                </div>
              )}

              {/* Variance */}
              {fuelStats.avgVariance !== null && fuelStats.avgActual && fuelStats.avgEstimated && (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    {fuelStats.avgVariance > 0 ? (
                      <TrendingUpIcon className="h-4 w-4 text-orange-500" />
                    ) : fuelStats.avgVariance < 0 ? (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    ) : null}
                    <div>
                      <div className="text-xs text-muted-foreground">Variance</div>
                      <div className={`text-lg font-bold ${
                        fuelStats.avgVariance > 10 ? 'text-orange-600' :
                        fuelStats.avgVariance < -10 ? 'text-green-600' :
                        'text-muted-foreground'
                      }`}>
                        {fuelStats.avgVariance > 0 ? '+' : ''}{fuelStats.avgVariance.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {fuelStats.avgVariance > 0 ? 'Using more' : fuelStats.avgVariance < 0 ? 'Using less' : 'On target'} than estimated
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Note:</strong> Fuel consumption estimates are assumptions based on manufacturer data and vehicle age.
                  Actual consumption may vary based on driving conditions, vehicle condition, driver behavior, and other factors.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}

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
              {isFilterActive
                ? stats.totalDistance.toFixed(1)
                : typeof totalMileage === 'number'
                  ? totalMileage.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : stats.totalDistance.toFixed(1)
              } <span className="text-base font-normal">km</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-purple-500/10 p-3 text-center">
              <Route className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-purple-500">
                {isFilterActive ? stats.totalTrips : stats.todayTrips}
              </div>
              <div className="text-xs text-muted-foreground">
                {isFilterActive ? "Total Trips" : "Today"}
              </div>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">
                {stats.avgPerDay.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Avg km/day</div>
            </div>
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <Calendar className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold text-primary">
                {isFilterActive
                  ? stats.daysWithData
                  : stats.weekDistance.toFixed(1)
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
                {stats.totalDistance.toFixed(1)} km
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: {stats.avgPerDay.toFixed(1)}/day
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
              <div className="text-lg font-bold text-purple-500">{stats.totalTrips} trips</div>
              <div className="text-xs text-muted-foreground">
                {stats.totalDistance.toFixed(1)} km total
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
                {stats.daysWithData > 0 ? (stats.totalTrips / stats.daysWithData).toFixed(1) : '0.0'}
              </div>
              <div className="text-xs text-muted-foreground">Avg trips/day</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-500">
                {Math.max(...chartData.map(d => d.trips), 0)}
              </div>
              <div className="text-xs text-muted-foreground">Peak trips</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-primary">
                {stats.avgKmPerTrip.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Avg km/trip</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
