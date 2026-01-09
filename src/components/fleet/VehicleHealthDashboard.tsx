import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Battery,
  Activity,
  Radio,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  X,
  Loader2,
  RefreshCw,
  Shield,
  AlertCircle,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface VehicleHealthDashboardProps {
  deviceId: string;
}

interface HealthMetrics {
  overall_health_score: number;
  battery_health_score: number;
  driving_behavior_score: number;
  connectivity_score: number;
  trend: string;
  score_change: number;
  measured_at: string;
  active_recommendations: number;
}

interface MaintenanceRecommendation {
  id: string;
  title: string;
  description: string;
  recommendation_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  predicted_issue: string;
  confidence_score: number;
  estimated_days_until_failure: number | null;
  created_at: string;
  days_since_created: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  urgent: 'bg-red-100 text-red-800 border-red-200'
};

const PRIORITY_BADGE_COLORS: Record<string, string> = {
  low: 'bg-blue-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500'
};

export function VehicleHealthDashboard({ deviceId }: VehicleHealthDashboardProps) {
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [recommendations, setRecommendations] = useState<MaintenanceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchHealthData();
  }, [deviceId]);

  const fetchHealthData = async () => {
    setLoading(true);
    try {
      // Fetch health metrics
      const { data: healthData, error: healthError } = await supabase.rpc('get_vehicle_health', {
        p_device_id: deviceId
      });

      if (healthError) throw healthError;
      setHealth(healthData?.[0] || null);

      // Fetch maintenance recommendations
      const { data: recData, error: recError } = await supabase.rpc('get_maintenance_recommendations', {
        p_device_id: deviceId,
        p_status: 'active'
      });

      if (recError) throw recError;
      setRecommendations(recData || []);
    } catch (err) {
      console.error('Error fetching health data:', err);
      toast({
        title: "Error",
        description: "Failed to load health data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger health recalculation
      const { error } = await supabase.rpc('calculate_vehicle_health', {
        p_device_id: deviceId
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Health metrics recalculated"
      });

      await fetchHealthData();
    } catch (err) {
      console.error('Error refreshing health:', err);
      toast({
        title: "Error",
        description: "Failed to refresh health data",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcknowledge = async (recommendationId: string) => {
    setAcknowledging(recommendationId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('acknowledge_maintenance_recommendation', {
        p_recommendation_id: recommendationId,
        p_user_id: user.id,
        p_notes: null
      });

      if (error) throw error;

      toast({
        title: "Acknowledged",
        description: "Recommendation marked as acknowledged"
      });

      setRecommendations(prev => prev.filter(r => r.id !== recommendationId));
    } catch (err) {
      console.error('Error acknowledging recommendation:', err);
      toast({
        title: "Error",
        description: "Failed to acknowledge recommendation",
        variant: "destructive"
      });
    } finally {
      setAcknowledging(null);
    }
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
      case 'critical':
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

  const timeAgo = formatDistanceToNow(new Date(health.measured_at), { addSuffix: true });

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
              {health.score_change !== 0 && (
                <Badge variant="secondary" className="text-xs">
                  {health.score_change > 0 ? '+' : ''}{health.score_change}
                </Badge>
              )}
            </div>
          </div>

          <Progress
            value={health.overall_health_score}
            className="h-2"
            indicatorClassName={getHealthBarColor(health.overall_health_score)}
          />

          <p className="text-xs text-muted-foreground">
            Last updated {timeAgo}
          </p>
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
          <Progress
            value={health.battery_health_score}
            className="h-1 mt-2"
            indicatorClassName={getHealthBarColor(health.battery_health_score)}
          />
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Driving</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.driving_behavior_score)}`}>
            {health.driving_behavior_score}
          </div>
          <Progress
            value={health.driving_behavior_score}
            className="h-1 mt-2"
            indicatorClassName={getHealthBarColor(health.driving_behavior_score)}
          />
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Signal</span>
          </div>
          <div className={`text-xl font-bold ${getHealthColor(health.connectivity_score)}`}>
            {health.connectivity_score}
          </div>
          <Progress
            value={health.connectivity_score}
            className="h-1 mt-2"
            indicatorClassName={getHealthBarColor(health.connectivity_score)}
          />
        </Card>
      </div>

      {/* Maintenance Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Maintenance Recommendations</h3>
            <Badge variant="secondary" className="text-xs">
              {recommendations.length}
            </Badge>
          </div>

          {recommendations.map((rec) => {
            const colorClass = PRIORITY_COLORS[rec.priority];
            const badgeColor = PRIORITY_BADGE_COLORS[rec.priority];
            const createdAgo = formatDistanceToNow(new Date(rec.created_at), { addSuffix: true });

            return (
              <Card
                key={rec.id}
                className={`p-3 border-l-4 ${colorClass}`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm">{rec.title}</h4>
                    <Badge className={`${badgeColor} text-white text-xs shrink-0`}>
                      {rec.priority.toUpperCase()}
                    </Badge>
                  </div>

                  {rec.description && (
                    <p className="text-xs text-muted-foreground">{rec.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {rec.estimated_days_until_failure && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {rec.estimated_days_until_failure} days
                      </span>
                    )}
                    {rec.confidence_score && (
                      <Badge variant="outline" className="text-xs">
                        {(rec.confidence_score * 100).toFixed(0)}% confidence
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Created {createdAgo}
                  </p>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAcknowledge(rec.id)}
                    disabled={acknowledging === rec.id}
                    className="h-7 text-xs"
                  >
                    {acknowledging === rec.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Acknowledging...
                      </>
                    ) : (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Acknowledge
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {recommendations.length === 0 && (
        <Card className="p-4 text-center">
          <Check className="h-8 w-8 mx-auto mb-2 text-green-600" />
          <p className="text-sm font-medium">All Clear!</p>
          <p className="text-xs text-muted-foreground">No active maintenance recommendations</p>
        </Card>
      )}
    </div>
  );
}
