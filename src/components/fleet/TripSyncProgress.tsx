import { useTripSyncStatus } from "@/hooks/useTripSync";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, Route } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const progress = syncStatus?.sync_progress_percent ?? 0;
  const tripsProcessed = syncStatus?.trips_processed ?? 0;
  const tripsTotal = syncStatus?.trips_total ?? null;
  const currentOperation = syncStatus?.current_operation ?? 'Processing trips...';

  // Calculate trips remaining (countdown) - MUST be before early return
  const tripsRemaining = useMemo(() => {
    if (tripsTotal === null || tripsTotal === 0) {
      // If total is unknown, show processed count
      return tripsProcessed > 0 ? `${tripsProcessed} trips processed` : 'Processing...';
    }
    
    const remaining = tripsTotal - tripsProcessed;
    if (remaining <= 0) {
      return 'Completing...';
    }
    
    return `${remaining} trip${remaining !== 1 ? 's' : ''} remaining`;
  }, [tripsTotal, tripsProcessed]);

  // Show progress if:
  // 1. Status is "processing" OR
  // 2. isSyncing is true (optimistic state) OR
  // 3. We're loading and isSyncing is true (initial sync start)
  const isProcessing = syncStatus?.sync_status === 'processing' || isSyncing;
  
  // Don't show anything if not processing
  if (!isProcessing && !isSyncing) {
    return null;
  }

  // If we're syncing but don't have status yet, show initial state
  if (isSyncing && (!syncStatus || syncStatus.sync_status !== 'processing')) {
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

  // Show progress details
  const showProgressDetails = tripsTotal !== null && tripsTotal > 0;

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
              {/* Countdown display - prominent */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary tabular-nums">
                  {tripsRemaining}
                </span>
                {showProgressDetails && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({tripsProcessed}/{tripsTotal})
                  </span>
                )}
              </div>
            </div>
            
            {/* Progress bar */}
            {showProgressDetails && (
              <Progress 
                value={progress} 
                className="h-2 mb-2" 
              />
            )}
            
            {/* Current operation */}
            <p className="text-xs text-muted-foreground">
              {currentOperation}
            </p>
            
            {/* Visual countdown indicator */}
            {showProgressDetails && tripsTotal > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <span>Progress:</span>
                <span className="font-medium text-primary tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
