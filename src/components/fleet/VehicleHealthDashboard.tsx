import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  connectivity_score: number;
  safety_score: number;
  utilization_score: number;
  data_quality_score: number;
  confidence_score: number;
  trend: string;
  score_date?: string;
  active_recommendations?: number;
}

interface DailyHealthRow {
  score_date: string;
  health_score: number;
  confidence_score: number;
  trend: string;
  component_scores: {
    connectivity_score?: number;
    safety_score?: number;
    utilization_score?: number;
    data_quality_score?: number;
  };
  active_recommendations?: number;
}

interface LegacyHealthRow {
  overall_health_score: number;
  battery_health_score: number;
  driving_behavior_score: number;
  connectivity_score: number;
  trend: string;
  active_recommendations?: number;
}

export function VehicleHealthDashboard({ deviceId }: VehicleHealthDashboardProps) {
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchHealthData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: dailyRows, error: dailyError } = await (supabase as any).rpc('get_vehicle_health_daily', {
        p_device_id: deviceId,
        p_start_date: startDate,
        p_end_date: today
      });

      if (dailyError) throw dailyError;

      const latestDaily = (Array.isArray(dailyRows) ? (dailyRows as DailyHealthRow[]) : [])[0] ?? null;

      if (latestDaily) {
        const components = latestDaily.component_scores ?? {};
        setHealth({
          overall_health_score: latestDaily.health_score ?? 0,
          connectivity_score: components.connectivity_score ?? 0,
          safety_score: components.safety_score ?? 0,
          utilization_score: components.utilization_score ?? 0,
          data_quality_score: components.data_quality_score ?? 0,
          confidence_score: latestDaily.confidence_score ?? 0,
          trend: latestDaily.trend ?? 'stable',
          score_date: latestDaily.score_date,
          active_recommendations: latestDaily.active_recommendations ?? 0
        });
        return;
      }

      const { data: legacyRows, error: legacyError } = await (supabase as any).rpc('get_vehicle_health', {
        p_device_id: deviceId
      });
      if (legacyError) throw legacyError;

      const legacy = (Array.isArray(legacyRows) ? (legacyRows as LegacyHealthRow[]) : [])[0] ?? null;
      if (!legacy) return;

      setHealth({
        overall_health_score: legacy.overall_health_score ?? 0,
        connectivity_score: legacy.connectivity_score ?? 0,
        safety_score: legacy.driving_behavior_score ?? 0,
        utilization_score: 70,
        data_quality_score: legacy.battery_health_score ?? 0,
        confidence_score: 55,
        trend: legacy.trend ?? 'stable',
        active_recommendations: legacy.active_recommendations ?? 0
      });
    } catch (err) {
      console.error('Error fetching health data:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await (supabase as any).rpc('compute_vehicle_health_features_day', {
        p_device_id: deviceId,
        p_date: today
      });
      await (supabase as any).rpc('compute_vehicle_health_score_day', {
        p_device_id: deviceId,
        p_date: today
      });
    } catch (error) {
      console.error('Error recomputing daily health:', error);
    }
    await fetchHealthData();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Daily health metrics updated"
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
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Confidence: {health.confidence_score}%</span>
            {health.score_date && <span>Day: {health.score_date}</span>}
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
            <Radio className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Connectivity</span>
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

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Safety</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.safety_score)}`}>
            {health.safety_score}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full ${getHealthBarColor(health.safety_score)}`}
              style={{ width: `${health.safety_score}%` }}
            />
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Battery className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Utilization</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.utilization_score)}`}>
            {health.utilization_score}
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-2">
            <div 
              className={`h-full ${getHealthBarColor(health.utilization_score)}`}
              style={{ width: `${health.utilization_score}%` }}
            />
          </div>
        </Card>
      </div>

      {/* All Clear Message */}
      <Card className="p-4 text-center">
        <Check className="h-8 w-8 mx-auto mb-2 text-green-600" />
        <p className="text-sm font-medium">System Status</p>
        <p className="text-xs text-muted-foreground">
          Active maintenance recommendations: {health.active_recommendations ?? 0}
        </p>
      </Card>
    </div>
  );
}
