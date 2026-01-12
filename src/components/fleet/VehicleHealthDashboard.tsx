import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Battery,
  Activity,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  Loader2,
  RefreshCw,
  Shield
} from "lucide-react";

interface VehicleHealthDashboardProps {
  deviceId: string;
}

interface HealthMetrics {
  overall_health_score: number;
  battery_health_score: number;
  driving_behavior_score: number;
  connectivity_score: number;
  trend: string;
}

export function VehicleHealthDashboard({ deviceId }: VehicleHealthDashboardProps) {
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchHealthData();
  }, [deviceId]);

  const fetchHealthData = async () => {
    setLoading(true);
    try {
      // Fetch position history to calculate health metrics
      const { data: positions, error } = await (supabase
        .from('position_history' as any)
        .select('speed, battery_percent, ignition_on, gps_time')
        .eq('device_id', deviceId)
        .order('gps_time', { ascending: false })
        .limit(100) as any) as { data: { speed: number; battery_percent: number; ignition_on: boolean; gps_time: string }[] | null; error: any };

      if (error) throw error;

      if (positions && positions.length > 0) {
        // Calculate health metrics from position history
        const batteryReadings = positions
          .filter(p => p.battery_percent && p.battery_percent > 0)
          .map(p => p.battery_percent as number);
        
        const avgBattery = batteryReadings.length > 0 
          ? batteryReadings.reduce((a, b) => a + b, 0) / batteryReadings.length 
          : 50;
        
        const speedReadings = positions
          .filter(p => p.speed !== null)
          .map(p => p.speed as number);
        
        const avgSpeed = speedReadings.length > 0 
          ? speedReadings.reduce((a, b) => a + b, 0) / speedReadings.length 
          : 0;
        
        // Calculate scores
        const batteryScore = Math.min(100, avgBattery * 1.2);
        const drivingScore = avgSpeed < 80 ? 90 : avgSpeed < 100 ? 70 : 50;
        const connectivityScore = (positions.length / 100) * 100;
        const overallScore = Math.round((batteryScore + drivingScore + connectivityScore) / 3);

        setHealth({
          overall_health_score: overallScore,
          battery_health_score: Math.round(batteryScore),
          driving_behavior_score: drivingScore,
          connectivity_score: Math.round(connectivityScore),
          trend: overallScore >= 70 ? 'stable' : 'declining'
        });
      }
    } catch (err) {
      console.error('Error fetching health data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHealthData();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Health metrics updated"
    });
  };

  const getHealthColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getHealthBarColor = (score: number): string => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    if (score >= 40) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading health data...
      </div>
    );
  }

  if (!health) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 mx-auto mb-3 opacity-40 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No health data available</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-3"
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Calculating...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Calculate Health
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Health Card */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${getHealthColor(health.overall_health_score)}`} />
            <h3 className="font-semibold">Overall Health</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-3xl font-bold ${getHealthColor(health.overall_health_score)}`}>
              {health.overall_health_score}
            </span>
            <div className="flex items-center gap-2">
              {getTrendIcon(health.trend)}
              <Badge variant="outline" className="text-xs capitalize">
                {health.trend}
              </Badge>
            </div>
          </div>

          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full ${getHealthBarColor(health.overall_health_score)} transition-all`}
              style={{ width: `${health.overall_health_score}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Individual Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Battery className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Battery</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.battery_health_score)}`}>
            {health.battery_health_score}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full ${getHealthBarColor(health.battery_health_score)}`}
              style={{ width: `${health.battery_health_score}%` }}
            />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Driving</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.driving_behavior_score)}`}>
            {health.driving_behavior_score}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full ${getHealthBarColor(health.driving_behavior_score)}`}
              style={{ width: `${health.driving_behavior_score}%` }}
            />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Signal</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.connectivity_score)}`}>
            {health.connectivity_score}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full ${getHealthBarColor(health.connectivity_score)}`}
              style={{ width: `${health.connectivity_score}%` }}
            />
          </div>
        </Card>
      </div>

      {/* All Clear Message */}
      <Card className="p-4 text-center">
        <Check className="h-8 w-8 mx-auto mb-2 text-green-600" />
        <p className="text-sm font-medium">System Healthy</p>
        <p className="text-xs text-muted-foreground">No active maintenance recommendations</p>
      </Card>
    </div>
  );
}