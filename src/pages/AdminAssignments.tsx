import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserVehicleGrid } from "@/components/admin/UserVehicleGrid";
import { useAssignmentStats } from "@/hooks/useAssignmentManagement";
import { Users, Car, Link2, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAssignments() {
  const { data: stats, isLoading } = useAssignmentStats();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehicle Assignments</h1>
          <p className="text-muted-foreground">
            Manage which users can access and control vehicles
          </p>
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
