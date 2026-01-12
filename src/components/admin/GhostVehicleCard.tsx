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
import { Ghost, Trash2, RefreshCw, Eye, AlertTriangle } from "lucide-react";

interface GhostVehicle {
  device_id: string;
  device_name: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
}

export function GhostVehicleCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [ghostVehicles, setGhostVehicles] = useState<GhostVehicle[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const GHOST_BUFFER_HOURS = 48;

  const fetchGhostVehicles = async () => {
    setLoading(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - GHOST_BUFFER_HOURS);

      // Get all vehicles older than 48 hours
      const { data: oldVehicles, error: vehiclesError } = await (supabase as any)
        .from("vehicles")
        .select("device_id, device_name, created_at")
        .lt("created_at", cutoffDate.toISOString());

      if (vehiclesError) throw vehiclesError;
      if (!oldVehicles || oldVehicles.length === 0) {
        setGhostVehicles([]);
        setLoading(false);
        return;
      }

      const deviceIds = oldVehicles.map((v) => v.device_id);

      // Get vehicles with valid positions
      const { data: vehiclesWithPositions } = await (supabase as any)
        .from("vehicle_positions")
        .select("device_id, latitude, longitude")
        .in("device_id", deviceIds)
        .not("latitude", "is", null)
        .neq("latitude", 0);

      const hasPositionSet = new Set(
        vehiclesWithPositions?.map((v) => v.device_id) || []
      );

      // Get vehicles with position history
      const { data: vehiclesWithHistory } = await (supabase as any)
        .from("position_history")
        .select("device_id")
        .in("device_id", deviceIds);

      const hasHistorySet = new Set(
        vehiclesWithHistory?.map((v) => v.device_id) || []
      );

      // Filter to ghost vehicles
      const ghosts = oldVehicles
        .filter(
          (v) => !hasPositionSet.has(v.device_id) && !hasHistorySet.has(v.device_id)
        )
        .map((v) => {
          const posData = vehiclesWithPositions?.find(
            (p) => p.device_id === v.device_id
          );
          return {
            ...v,
            latitude: posData?.latitude ?? null,
            longitude: posData?.longitude ?? null,
          };
        });

      setGhostVehicles(ghosts);
    } catch (error) {
      console.error("Error fetching ghost vehicles:", error);
      toast({
        title: "Error",
        description: "Failed to fetch ghost vehicles",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGhostVehicles();
  }, []);

  const handlePurge = async () => {
    setPurging(true);
    setShowConfirmDialog(false);

    try {
      const { data, error } = await supabase.functions.invoke("data-cleanup");

      if (error) throw error;

      const ghostResult = data?.results?.ghost_vehicles;
      if (ghostResult?.success) {
        toast({
          title: "Purge Complete",
          description: `Successfully purged ${ghostResult.purged_count} ghost vehicles`,
        });
        await fetchGhostVehicles();
      } else if (ghostResult?.error) {
        throw new Error(ghostResult.error);
      }
    } catch (error) {
      console.error("Error purging ghost vehicles:", error);
      toast({
        title: "Purge Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
    setPurging(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ghost className="h-5 w-5 text-muted-foreground" />
              Ghost Vehicle Cleanup
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchGhostVehicles}
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
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{ghostVehicles.length}</p>
                    <p className="text-sm text-muted-foreground">
                      Ghost Vehicles Detected
                    </p>
                  </div>
                </div>
                <Badge variant={ghostVehicles.length > 0 ? "destructive" : "secondary"}>
                  {ghostVehicles.length > 0 ? "Action Required" : "All Clear"}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Ghost vehicles are imported devices that have been in the system for
                over 48 hours but have never sent any GPS data. Purging them reduces
                database bloat.
              </p>

              {/* Preview List */}
              {showPreview && ghostVehicles.length > 0 && (
                <ScrollArea className="h-[200px] rounded-lg border border-border">
                  <div className="p-2 space-y-1">
                    {ghostVehicles.map((vehicle) => (
                      <div
                        key={vehicle.device_id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm"
                      >
                        <div>
                          <span className="font-medium">
                            {vehicle.device_name || vehicle.device_id}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Created: {formatDate(vehicle.created_at)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          No Data
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {ghostVehicles.length > 0 && (
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
                  disabled={ghostVehicles.length === 0 || purging}
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {purging ? "Purging..." : `Purge ${ghostVehicles.length} Vehicles`}
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
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Ghost Vehicle Purge
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to permanently delete{" "}
                <strong>{ghostVehicles.length} ghost vehicles</strong> and all their
                associated data.
              </p>
              <p>
                This will also clean up related records from trips, chat history,
                analytics, and other tables.
              </p>
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
