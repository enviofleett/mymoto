import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserVehicleGrid } from "@/components/admin/UserVehicleGrid";
import { useAssignmentStats } from "@/hooks/useAssignmentManagement";
import { Users, Car, Link2, UserX, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminAssignments() {
  const { data: stats, isLoading } = useAssignmentStats();
  const [syncing, setSyncing] = useState(false);

  const handleSyncVehicles = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gps-data', {
        body: {
          action: 'querymonitorlist',
        },
      });

      if (error) throw error;

      toast.success('Vehicles synced successfully from GPS51');
      // Refresh the page to show updated data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('Vehicle sync error:', error);
      toast.error(`Sync failed: ${error.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vehicle Assignments</h1>
            <p className="text-muted-foreground">
              Manage which users can access and control vehicles
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSyncVehicles}
              disabled={syncing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from GPS51'}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Car className="h-4 w-4" />
                Total Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold">{stats?.totalVehicles.toLocaleString()}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Assigned
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div>
                  <p className="text-2xl font-bold text-green-500">
                    {stats?.assignedVehicles.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {((stats?.assignedVehicles || 0) / (stats?.totalVehicles || 1) * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <UserX className="h-4 w-4" />
                Unassigned
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-amber-500">
                  {stats?.unassignedVehicles.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Users with Vehicles
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div>
                  <p className="text-2xl font-bold">{stats?.usersWithVehicles}</p>
                  <p className="text-xs text-muted-foreground">
                    of {stats?.totalUsers} total users
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <UserVehicleGrid />
      </div>
    </DashboardLayout>
  );
}
