import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, Trash2, RefreshCw, Eye, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface StaleVehicle {
  device_id: string;
  device_name: string | null;
  gps_time: string;
}

const STALE_DAYS = 30;

export function StaleVehicleCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [staleVehicles, setStaleVehicles] = useState<StaleVehicle[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchStaleVehicles = async () => {
    setLoading(true);
    try {
      const staleCutoff = new Date();
      staleCutoff.setDate(staleCutoff.getDate() - STALE_DAYS);

      // Get vehicles with positions older than the cutoff
      const { data: stalePositions, error: posError } = await (supabase
        .from("vehicle_positions" as any)
        .select("device_id, gps_time")
        .lt("gps_time", staleCutoff.toISOString()) as any);

      if (posError) throw posError;
      if (!stalePositions || stalePositions.length === 0) {
        setStaleVehicles([]);
        setLoading(false);
        return;
      }

      const staleDeviceIds = stalePositions.map((v: any) => v.device_id);

      // Get vehicle names
      const { data: vehicleData } = await (supabase
        .from("vehicles" as any)
        .select("device_id, device_name")
        .in("device_id", staleDeviceIds) as any);

      const vehicleMap = new Map(
        (vehicleData || []).map((v: any) => [v.device_id, v.device_name])
      );

      // Combine data
      const staleList: StaleVehicle[] = stalePositions.map((pos: any) => ({
        device_id: pos.device_id,
        device_name: vehicleMap.get(pos.device_id) || null,
        gps_time: pos.gps_time,
      }));

      setStaleVehicles(staleList);
    } catch (error) {
      console.error("Error fetching stale vehicles:", error);
      toast({
        title: "Error",
        description: "Failed to fetch stale vehicles",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStaleVehicles();
  }, []);

  const handlePurge = async () => {
    setPurging(true);
    setShowConfirmDialog(false);

    try {
      const { data, error } = await supabase.functions.invoke("data-cleanup");

      if (error) throw error;

      const staleResult = data?.results?.stale_vehicles;
      if (staleResult?.success) {
        toast({
          title: "Purge Complete",
          description: `Successfully purged ${staleResult.purged_count} stale vehicles`,
        });
        await fetchStaleVehicles();
      } else if (staleResult?.error) {
        throw new Error(staleResult.error);
      }
    } catch (error) {
      console.error("Error purging stale vehicles:", error);
      toast({
        title: "Purge Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
    setPurging(false);
  };

  const formatLastSeen = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Stale Vehicle Cleanup
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchStaleVehicles}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{staleVehicles.length}</p>
                    <p className="text-sm text-muted-foreground">
                      Stale Vehicles Detected
                    </p>
                  </div>
                </div>
                <Badge variant={staleVehicles.length > 0 ? "secondary" : "outline"}>
                  {staleVehicles.length > 0 ? "Cleanup Available" : "All Active"}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Stale vehicles are devices that haven't reported GPS data in over{" "}
                <strong>{STALE_DAYS} days</strong>. Unlike ghost vehicles, they have
                historical data that will also be removed during cleanup.
              </p>

              {/* Preview List */}
              {showPreview && staleVehicles.length > 0 && (
                <ScrollArea className="h-[200px] rounded-lg border border-border">
                  <div className="p-2 space-y-1">
                    {staleVehicles.map((vehicle) => (
                      <div
                        key={vehicle.device_id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm"
                      >
                        <div>
                          <span className="font-medium">
                            {vehicle.device_name || vehicle.device_id}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Last seen: {formatLastSeen(vehicle.gps_time)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/50">
                          Offline
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {staleVehicles.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {showPreview ? "Hide" : "Preview"} List
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={staleVehicles.length === 0 || purging}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {purging ? "Purging..." : `Purge ${staleVehicles.length} Vehicles`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Confirm Stale Vehicle Purge
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to permanently delete{" "}
                <strong>{staleVehicles.length} stale vehicles</strong> and all their
                associated data including:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 pl-2">
                <li>Position history</li>
                <li>Trip records</li>
                <li>Chat history</li>
                <li>Analytics and events</li>
              </ul>
              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Purge All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
