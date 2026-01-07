import { Truck, Users, MapPin, Gauge } from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { MetricCard } from "@/components/fleet/MetricCard";
import { VehicleTable } from "@/components/fleet/VehicleTable";
import { FleetMap } from "@/components/fleet/FleetMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGpsStatus } from "@/components/fleet/AdminGpsStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useFleetData } from "@/hooks/useFleetData";

const recentActivity = [
  { id: 1, message: "Truck A-101 completed delivery in Denver", time: "2 min ago" },
  { id: 2, message: "Van B-205 started new route to LA", time: "15 min ago" },
  { id: 3, message: "Maintenance scheduled for Truck C-310", time: "1 hour ago" },
  { id: 4, message: "Driver Mike Davis clocked in", time: "2 hours ago" },
  { id: 5, message: "Fuel refill completed for Van D-415", time: "3 hours ago" },
];

const Index = () => {
  const { isAdmin } = useAuth();
  const { vehicles, metrics, loading, error } = useFleetData();

  const displayMetrics = [
    {
      title: "Total Vehicles",
      value: metrics.totalVehicles,
      change: loading ? "Loading..." : `${metrics.totalVehicles} tracked`,
      changeType: "neutral" as const,
      icon: Truck,
    },
    {
      title: "Moving Now",
      value: metrics.movingNow,
      change: loading ? "Loading..." : `${Math.round((metrics.movingNow / Math.max(metrics.totalVehicles, 1)) * 100)}% of fleet`,
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
      title: "Avg Fleet Speed",
      value: `${metrics.avgFleetSpeed} km/h`,
      change: loading ? "Loading..." : "Active vehicles",
      changeType: "neutral" as const,
      icon: Gauge,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's an overview of your fleet.
          </p>
        </div>

        {/* Admin GPS Status */}
        {isAdmin && <AdminGpsStatus />}

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
            Error loading fleet data: {error}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {displayMetrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </div>

        {/* Fleet Map */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Live Fleet Map</h2>
          <FleetMap vehicles={vehicles} loading={loading} />
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Vehicles Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Fleet Overview</h2>
              <a href="/vehicles" className="text-sm text-primary hover:underline">
                View all →
              </a>
            </div>
            <VehicleTable vehicles={vehicles} loading={loading} />
          </div>

          {/* Activity Feed */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-foreground">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{activity.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
