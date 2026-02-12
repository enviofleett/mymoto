import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  ComposedChart
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLagos } from "@/lib/timezone";
import { VehicleDailyStats } from "@/hooks/useVehicleProfile";
import { cn } from "@/lib/utils";
import { Gauge, Milestone, Clock } from "lucide-react";

interface MileageChartsProps {
  data: VehicleDailyStats[] | undefined;
  isLoading: boolean;
  className?: string;
}

export function MileageCharts({ data, isLoading, className }: MileageChartsProps) {
  // Process data for charts
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Sort by date ascending for chart
    return [...data].sort((a, b) => 
      new Date(a.stat_date).getTime() - new Date(b.stat_date).getTime()
    ).map(stat => ({
      date: formatLagos(new Date(stat.stat_date), "dd/MM"),
      fullDate: formatLagos(new Date(stat.stat_date), "EEE, MMM d"),
      distance: stat.total_distance_km,
      duration: Math.round(stat.total_duration_seconds / 60), // minutes
      trips: stat.trip_count,
      maxSpeed: stat.peak_speed || 0,
      avgSpeed: stat.avg_speed || 0,
    }));
  }, [data]);

  // Calculate summaries
  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;
    
    const totalDist = data.reduce((acc, curr) => acc + curr.total_distance_km, 0);
    const totalTime = data.reduce((acc, curr) => acc + curr.total_duration_seconds, 0);
    const avgSpeed = totalTime > 0 ? (totalDist / (totalTime / 3600)) : 0;
    
    return {
      totalDist: Math.round(totalDist),
      totalTimeHours: Math.round(totalTime / 3600 * 10) / 10,
      avgSpeed: Math.round(avgSpeed)
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-[250px] w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center min-h-[300px] h-[300px] bg-muted/20 rounded-xl border border-dashed", className)}>
        <Milestone className="h-10 w-10 text-muted-foreground/50 mb-2" />
        <p className="text-muted-foreground">No mileage data available for this period</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 min-h-[300px]", className)}>
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="bg-primary/10 p-2 rounded-full mb-2">
                <Milestone className="h-4 w-4 text-primary" />
              </div>
              <span className="text-2xl font-bold">{summary.totalDist}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">km Total</span>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="bg-blue-500/10 p-2 rounded-full mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-2xl font-bold">{summary.totalTimeHours}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Hours</span>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 border-primary/10">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="bg-orange-500/10 p-2 rounded-full mb-2">
                <Gauge className="h-4 w-4 text-orange-500" />
              </div>
              <span className="text-2xl font-bold">{summary.avgSpeed}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">km/h Avg</span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Chart */}
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0 pb-4">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Daily Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false}
                tickLine={false}
                dy={10}
              />
              <YAxis 
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false}
                tickLine={false}
                label={{ value: 'km', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 } }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false}
                tickLine={false}
                hide // Hide right axis ticks for cleaner look
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-xs">
                        <p className="font-semibold mb-2">{data.fullDate}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <span className="text-muted-foreground">Distance:</span>
                          <span className="font-mono text-right">{data.distance.toFixed(1)} km</span>
                          
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-mono text-right">{Math.floor(data.duration / 60)}h {data.duration % 60}m</span>
                          
                          <span className="text-muted-foreground">Trips:</span>
                          <span className="font-mono text-right">{data.trips}</span>
                          
                          <span className="text-muted-foreground">Max Speed:</span>
                          <span className="font-mono text-right">{Math.round(data.maxSpeed)} km/h</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                yAxisId="left"
                dataKey="distance" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]} 
                maxBarSize={40}
                fillOpacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgSpeed"
                stroke="hsl(var(--orange-500))" // Or generic accent color
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
