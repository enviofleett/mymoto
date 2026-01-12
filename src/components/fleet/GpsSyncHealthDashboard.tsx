import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  Clock, 
  AlertTriangle, 
  Truck, 
  Wifi, 
  WifiOff,
  RefreshCw 
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface SyncHealthData {
  total_vehicles: number | null;
  online_count: number | null;
  moving_count: number | null;
  stale_count: number | null;
  oldest_sync: string | null;
  newest_sync: string | null;
  avg_age_seconds: number | null;
}

export function GpsSyncHealthDashboard() {
  const { data: health, isLoading, error } = useQuery({
    queryKey: ['gps-sync-health'],
    queryFn: async (): Promise<SyncHealthData> => {
      const { data, error } = await (supabase
        .from('v_gps_sync_health' as any)
        .select('*')
        .single() as any);

      if (error) throw error;
      return data as SyncHealthData;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });

  const formatAge = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getSyncStatus = (avgAge: number | null) => {
    if (avgAge === null) return { label: 'Unknown', variant: 'secondary' as const };
    if (avgAge < 60) return { label: 'Excellent', variant: 'default' as const };
    if (avgAge < 180) return { label: 'Good', variant: 'default' as const };
    if (avgAge < 300) return { label: 'Fair', variant: 'secondary' as const };
    return { label: 'Degraded', variant: 'destructive' as const };
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            GPS Sync Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            GPS Sync Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load sync health data</p>
        </CardContent>
      </Card>
    );
  }

  const syncStatus = getSyncStatus(health?.avg_age_seconds ?? null);
  const staleCount = health?.stale_count ?? 0;
  const hasStaleVehicles = staleCount > 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              GPS Sync Health
            </CardTitle>
            <CardDescription>Real-time fleet synchronization status</CardDescription>
          </div>
          <Badge variant={syncStatus.variant} className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            {syncStatus.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Vehicles */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              <span className="text-xs font-medium">Total Fleet</span>
            </div>
            <p className="text-2xl font-bold">{health?.total_vehicles ?? 0}</p>
          </div>

          {/* Online Count */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-green-600">
              <Wifi className="h-4 w-4" />
              <span className="text-xs font-medium">Online</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{health?.online_count ?? 0}</p>
          </div>

          {/* Moving Count */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-blue-600">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-medium">Moving</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{health?.moving_count ?? 0}</p>
          </div>

          {/* Stale Count */}
          <div className={`bg-muted/50 rounded-lg p-3 space-y-1 ${hasStaleVehicles ? 'ring-1 ring-destructive/50' : ''}`}>
            <div className={`flex items-center gap-2 ${hasStaleVehicles ? 'text-destructive' : 'text-muted-foreground'}`}>
              <WifiOff className="h-4 w-4" />
              <span className="text-xs font-medium">Stale (&gt;5min)</span>
            </div>
            <p className={`text-2xl font-bold ${hasStaleVehicles ? 'text-destructive' : ''}`}>
              {staleCount}
            </p>
          </div>
        </div>

        {/* Sync Timing Details */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Avg Sync Age:</span>
              <span className="font-medium">{formatAge(health?.avg_age_seconds ?? null)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Oldest:</span>
              <span className="font-medium">{formatTime(health?.oldest_sync ?? null)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Newest:</span>
              <span className="font-medium">{formatTime(health?.newest_sync ?? null)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
