import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, TrendingUp, Navigation, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

interface DailyMileage {
  date: string;
  distance_km: number;
  trip_count: number;
  total_duration_minutes: number;
}

interface VehicleMileageChartProps {
  deviceId: string;
  days?: number;
}

export function VehicleMileageChart({ deviceId, days = 7 }: VehicleMileageChartProps) {
  const { data: mileageData, isLoading } = useQuery({
    queryKey: ['vehicle-mileage', deviceId, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_daily_mileage', {
          p_device_id: deviceId,
          p_days: days
        });

      if (error) throw error;
      return (data || []) as DailyMileage[];
    },
    enabled: !!deviceId,
    refetchInterval: 300000 // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading mileage data...
      </div>
    );
  }

  if (!mileageData || mileageData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Navigation className="h-12 w-12 mb-3 text-muted-foreground/50" />
        <p className="font-medium">No Mileage Data</p>
        <p className="text-sm text-center mt-1">
          Daily mileage will appear as trips are completed
        </p>
      </div>
    );
  }

  // Prepare chart data (reverse to show oldest to newest left to right)
  const chartData = [...mileageData].reverse().map(item => ({
    date: item.date,
    dateLabel: format(parseISO(item.date), 'MMM d'),
    dayLabel: format(parseISO(item.date), 'EEE'),
    distance: Number(item.distance_km),
    trips: Number(item.trip_count)
  }));

  // Calculate summary statistics
  const totalDistance = mileageData.reduce((sum, item) => sum + Number(item.distance_km), 0);
  const totalTrips = mileageData.reduce((sum, item) => sum + Number(item.trip_count), 0);
  const avgDistance = totalDistance / days;
  const maxDistance = Math.max(...mileageData.map(item => Number(item.distance_km)));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-2">{data.dateLabel}</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Distance:</span>
              <span className="font-semibold text-primary">{data.distance.toFixed(1)} km</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Trips:</span>
              <span className="font-semibold">{data.trips}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Navigation className="h-3 w-3" />
            <span>Total Distance</span>
          </div>
          <p className="text-lg font-bold text-primary">
            {totalDistance.toFixed(1)} km
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            <span>Avg/Day</span>
          </div>
          <p className="text-lg font-bold">
            {avgDistance.toFixed(1)} km
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Calendar className="h-3 w-3" />
            <span>Total Trips</span>
          </div>
          <p className="text-lg font-bold">
            {totalTrips}
          </p>
        </div>
      </div>

      {/* Chart Title */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Daily Mileage - Last {days} Days</h4>
        <span className="text-xs text-muted-foreground">
          Max: {maxDistance.toFixed(1)} km
        </span>
      </div>

      {/* Bar Chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="dayLabel"
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="text-muted-foreground"
              label={{ value: 'km', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }} />
            <Bar dataKey="distance" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.distance === maxDistance ? '#3b82f6' : '#94a3b8'}
                  opacity={entry.distance === 0 ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-blue-500" />
          <span>Highest</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-slate-400" />
          <span>Regular</span>
        </div>
      </div>
    </div>
  );
}
