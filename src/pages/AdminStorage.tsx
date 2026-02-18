import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Database, HardDrive, Clock, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminGpsStatus } from "@/components/fleet/AdminGpsStatus";
import { InactiveVehiclesCleanup } from "@/components/admin/InactiveVehiclesCleanup";

interface TableStat {
  table: string;
  rowCount: number;
  estimatedSizeMB: number;
}

interface StorageData {
  tables: TableStat[];
  totalEstimatedSizeMB: number;
  retentionConfig: Record<string, string>;
  oldestRecords: Record<string, string | null>;
  freeTierLimitMB: number;
  usagePercent: number;
}

export default function AdminStorage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const { data: result, error } = await supabase.functions.invoke("storage-stats");
      if (error) throw error;
      if (result?.success) {
        setData(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch storage stats:", err);
      toast.error("Failed to load storage statistics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchStats();
  }, [isAdmin]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const runCleanup = async () => {
    try {
      toast.info("Running data cleanup...");
      const { data: result, error } = await supabase.functions.invoke("data-cleanup");
      if (error) throw error;
      toast.success("Cleanup completed successfully");
      fetchStats();
    } catch (err) {
      console.error("Cleanup failed:", err);
      toast.error("Cleanup failed");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No data";
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return `${diffDays} days ago`;
  };

  const getRetentionStatus = (table: string, oldestDate: string | null) => {
    if (!oldestDate || !data?.retentionConfig[table]) return null;
    
    const date = new Date(oldestDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    const threshold = parseInt(data.retentionConfig[table]);
    
    if (diffDays > threshold) {
      return { status: "warning", message: `Data older than ${threshold} days exists` };
    }
    return { status: "ok", message: "Within retention policy" };
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Storage Monitoring</h1>
            <p className="text-muted-foreground">Database size, table stats, and retention status</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="destructive" onClick={runCleanup}>
              <Clock className="mr-2 h-4 w-4" />
              Run Cleanup Now
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading storage statistics...</p>
          </div>
        ) : data ? (
          <>
            {/* GPS Token Status */}
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
              <AdminGpsStatus />
            </div>

            {/* Inactive Vehicles Cleanup */}
            <InactiveVehiclesCleanup />

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Estimated Database Size</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.totalEstimatedSizeMB} MB</div>
                  <p className="text-xs text-muted-foreground">of {data.freeTierLimitMB} MB free tier</p>
                  <Progress value={data.usagePercent} className="mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Usage Status</CardTitle>
                  {data.usagePercent > 80 ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.usagePercent}%</div>
                  <p className="text-xs text-muted-foreground">
                    {data.usagePercent > 80 ? "Consider cleanup" : "Healthy usage"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tables</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.tables.length}</div>
                  <p className="text-xs text-muted-foreground">
                    {data.tables.reduce((sum, t) => sum + t.rowCount, 0).toLocaleString()} total rows
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Retention Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Retention Status
                </CardTitle>
                <CardDescription>
                  Automated cleanup runs daily at 3 AM UTC
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(data.retentionConfig).map(([table, retention]) => {
                    const status = getRetentionStatus(table, data.oldestRecords[table]);
                    return (
                      <div key={table} className="p-4 border rounded-lg">
                        <p className="font-medium text-sm">{table}</p>
                        <p className="text-xs text-muted-foreground">Retention: {retention}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Oldest: {formatDate(data.oldestRecords[table])}
                        </p>
                        {status && (
                          <Badge
                            variant={status.status === "ok" ? "secondary" : "destructive"}
                            className="mt-2"
                          >
                            {status.status === "ok" ? "✓ OK" : "⚠ Needs cleanup"}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Table Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Table Statistics
                </CardTitle>
                <CardDescription>Row counts and estimated sizes (sorted by size)</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead className="text-right">Row Count</TableHead>
                        <TableHead className="text-right">Est. Size (MB)</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tables.map((table) => (
                        <TableRow key={table.table}>
                          <TableCell className="font-medium">{table.table}</TableCell>
                          <TableCell className="text-right">{table.rowCount.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{table.estimatedSizeMB}</TableCell>
                          <TableCell className="text-right">
                            {data.totalEstimatedSizeMB > 0
                              ? Math.round((table.estimatedSizeMB / data.totalEstimatedSizeMB) * 100)
                              : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Failed to load storage data</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
