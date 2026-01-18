import { Wifi, MapPin, BatteryWarning, Truck, RefreshCw, UserPlus, Plus } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { MetricCard } from "@/components/fleet/MetricCard";
import { RecentActivityFeed } from "@/components/fleet/RecentActivityFeed";
import { GpsSyncHealthDashboard } from "@/components/fleet/GpsSyncHealthDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData } from "@/hooks/useFleetData";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { isAdmin } = useAuth();
  const { vehicles, metrics, loading, error, connectionStatus, refetch } = useFleetData();
  const navigate = useNavigate();

  // Calculate vehicles with position data vs total registered
  const vehiclesWithData = vehicles.length;
  const noDataCount = metrics.totalVehicles - vehiclesWithData;
  
  const displayMetrics = [
    {
      title: "Online Vehicles",
      value: metrics.onlineCount,
      change: loading ? "Loading..." : noDataCount > 0 
        ? `${vehiclesWithData} tracked / ${metrics.totalVehicles} registered` 
        : `${metrics.totalVehicles} total`,
      changeType: metrics.onlineCount > 0 ? "positive" as const : "neutral" as const,
      icon: Wifi,
    },
    {
      title: "Moving Now",
      value: metrics.movingNow,
      change: loading ? "Loading..." : `${Math.round((metrics.movingNow / Math.max(metrics.onlineCount, 1)) * 100)}% of online`,
      changeType: metrics.movingNow > 0 ? "positive" as const : "neutral" as const,
      icon: MapPin,
    },
    {
      title: "Low Battery",
      value: metrics.lowBatteryCount,
      change: loading ? "Loading..." : metrics.lowBatteryCount > 0 ? "Needs attention" : "All healthy",
      changeType: metrics.lowBatteryCount > 0 ? "negative" as const : "positive" as const,
      icon: BatteryWarning,
    },
  ];

  const handleRefreshGPS = () => {
    refetch();
  };

  return (
    <DashboardLayout connectionStatus={connectionStatus}>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
          <p className="text-muted-foreground">
            Real-time fleet telemetry and operational status.
          </p>
        </div>

        {/* Admin GPS Sync Health */}
        {isAdmin && (
          <GpsSyncHealthDashboard />
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
            Connection Error: {error}
          </div>
        )}

        {/* Metrics Grid - Only show if not admin (admin sees GPS Sync Health instead) */}
        {!isAdmin && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {displayMetrics.map((metric) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/fleet")}
              >
                <Plus className="h-4 w-4" />
                Add Vehicle
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleRefreshGPS}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh GPS
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/fleet?tab=drivers")}
              >
                <UserPlus className="h-4 w-4" />
                Add Driver
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <RecentActivityFeed />
      </div>
    </DashboardLayout>
  );
};

export default Index;
