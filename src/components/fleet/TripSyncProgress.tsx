import { useTripSyncStatus } from "@/hooks/useTripSync";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TripSyncProgressProps {
  deviceId: string;
}

export function TripSyncProgress({ deviceId }: TripSyncProgressProps) {
  const { data: syncStatus, isLoading } = useTripSyncStatus(deviceId, true);

  // Don't show anything if not processing or if loading
  if (isLoading || !syncStatus || syncStatus.sync_status !== 'processing') {
    return null;
  }

  const progress = syncStatus.sync_progress_percent ?? 0;
  const tripsProcessed = syncStatus.trips_processed ?? 0;
  const tripsTotal = syncStatus.trips_total ?? 0;
  const currentOperation = syncStatus.current_operation ?? 'Processing trips...';

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">Syncing Trips</span>
              <span className="text-sm text-muted-foreground">
                {tripsProcessed} / {tripsTotal} trips
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {currentOperation}
        </p>
      </CardContent>
    </Card>
  );
}
