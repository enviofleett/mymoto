import { Users, MapPin, Wifi, BatteryWarning } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { MetricCard } from "@/components/fleet/MetricCard";
import { VehicleTable } from "@/components/fleet/VehicleTable";
import { FleetMap } from "@/components/fleet/FleetMap";
import { FleetInsights } from "@/components/fleet/FleetInsights";
import { RecentActivityFeed } from "@/components/fleet/RecentActivityFeed";
import { AdminGpsStatus } from "@/components/fleet/AdminGpsStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData } from "@/hooks/useFleetData";

const Index = () => {
  const { isAdmin } = useAuth();
  const { vehicles, metrics, loading, error, connectionStatus, refetch } = useFleetData();

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
      title: "Assigned Drivers",
      value: metrics.assignedDrivers,
      change: loading ? "Loading..." : `${metrics.totalVehicles - metrics.assignedDrivers} unassigned`,
      changeType: "neutral" as const,
      icon: Users,
    },
    {
      title: "Low Battery",
      value: metrics.lowBatteryCount,
      change: loading ? "Loading..." : metrics.lowBatteryCount > 0 ? "Needs attention" : "All healthy",
      changeType: metrics.lowBatteryCount > 0 ? "negative" as const : "positive" as const,
      icon: BatteryWarning,
    },
  ];

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

        {/* Admin GPS Status */}
        {isAdmin && <AdminGpsStatus />}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
            Connection Error: {error}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {displayMetrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </div>

        {/* AI Fleet Insights */}
        <FleetInsights />

        {/* Fleet Map */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Live Fleet Map
          </h2>
          <FleetMap vehicles={vehicles} loading={loading} />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Vehicles Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Vehicle Status</h2>
              <a href="/vehicles" className="text-sm text-primary hover:underline">
                View Full Fleet →
              </a>
            </div>
            <VehicleTable vehicles={vehicles} loading={loading} onAssignmentChange={refetch} />
          </div>

          {/* Real Activity Feed */}
          <div className="lg:col-span-1">
            <RecentActivityFeed />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
