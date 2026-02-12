import { useTripSyncStatus } from "@/hooks/useTripSync";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, Route } from "lucide-react";
import { useMemo } from "react";

interface TripSyncProgressProps {
  deviceId: string;
  isSyncing?: boolean; // Pass isSyncing state from parent
}

export function TripSyncProgress({ deviceId, isSyncing = false }: TripSyncProgressProps) {
  const { data: syncStatus, isLoading } = useTripSyncStatus(deviceId, true);

  // Debug logging (development only) - removed object logging to avoid SQL parsing issues
  if (process.env.NODE_ENV === 'development') {
    console.log('[TripSyncProgress]', deviceId, 'isSyncing:', isSyncing, 'isLoading:', isLoading, 'status:', syncStatus?.sync_status);
  }

  // Extract values safely (hooks must be called before any early returns)
  const tripsSynced = syncStatus?.trips_synced_count ?? 0;
  const lastTripSynced = syncStatus?.last_trip_synced ?? null;
  const syncError = syncStatus?.trip_sync_error ?? null;

  const lastTripLabel = useMemo(() => {
    if (!lastTripSynced) return null;
    const date = new Date(lastTripSynced);
    return isNaN(date.getTime()) ? null : date.toLocaleString();
  }, [lastTripSynced]);

  // Show progress if:
  // 1. Status is "processing" OR
  // 2. isSyncing is true (optimistic state) OR
  // 3. We're loading and isSyncing is true (initial sync start)
  const isProcessing = syncStatus?.sync_status === 'syncing' || isSyncing;
  
  // Don't show anything if not processing
  if (!isProcessing && !isSyncing) {
    return null;
  }

  // If we're syncing but don't have status yet, show initial state
  if (isSyncing && (!syncStatus || syncStatus.sync_status !== 'syncing')) {
    return (
      <Card className="border-primary/20 bg-primary/5 mb-4">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Syncing Trips</span>
                </div>
                <span className="text-sm font-bold text-primary tabular-nums">
                  Starting sync...
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Initializing trip synchronization...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5 mb-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Loader2 className="h-5 w-5 text-primary animate-spin mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Syncing Trips</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary tabular-nums">
                  {tripsSynced} trip{tripsSynced === 1 ? "" : "s"} synced
                </span>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              {lastTripLabel ? `Last trip synced: ${lastTripLabel}` : "Processing latest trips from GPS51..."}
            </p>

            {syncError && (
              <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span>{syncError}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
