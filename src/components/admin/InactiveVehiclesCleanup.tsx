import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatLagos } from "@/lib/timezone";

interface InactiveVehicle {
  device_id: string;
  device_name: string;
  last_gps_time: string | null;
  days_inactive_count: number;
  has_position_record: boolean;
  has_history_record: boolean;
  created_at: string;
}

interface DeletionResults {
  vehicles_deleted: number;
  assignments_deleted: number;
  trips_deleted: number;
  device_ids: string[];
}

export function InactiveVehiclesCleanup() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [inactiveVehicles, setInactiveVehicles] = useState<InactiveVehicle[]>([]);
  const [daysInactive, setDaysInactive] = useState(30);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deletionResults, setDeletionResults] = useState<DeletionResults | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchInactiveVehicles = async () => {
    if (!isAdmin) return;

    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("remove-inactive-vehicles", {
        body: {
          action: "preview",
          days_inactive: daysInactive,
        },
      });

      if (error) throw error;

      if (data.success) {
        setInactiveVehicles(data.vehicles || []);
        toast({
          title: "Preview Complete",
          description: `Found ${data.count} inactive vehicle(s)`,
        });
      }
    } catch (err: any) {
      console.error("Error fetching inactive vehicles:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to fetch inactive vehicles",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || inactiveVehicles.length === 0) return;

    setIsDeleting(true);
    setShowConfirmDialog(false);

    try {
      const deviceIds = inactiveVehicles.map((v) => v.device_id);

      const { data, error } = await supabase.functions.invoke("remove-inactive-vehicles", {
        body: {
          action: "execute",
          days_inactive: daysInactive,
          device_ids: deviceIds,
        },
      });

      if (error) throw error;

      // Handle rate limiting
      if (data.error === "Rate limit exceeded") {
        toast({
          title: "Rate Limit",
          description: data.message || `Please wait ${data.retry_after || 10} seconds before trying again.`,
          variant: "default",
        });
        return;
      }

      if (data.success) {
        setDeletionResults(data.results);
        setInactiveVehicles([]);
        toast({
          title: "Deletion Complete",
          description: `Successfully removed ${data.results.vehicles_deleted} inactive vehicle(s). All deletions are logged for audit purposes.`,
        });
      } else {
        // Partial failure
        toast({
          title: "Deletion Incomplete",
          description: data.warning || data.error || "Some vehicles may have been deleted. Check the audit log for details.",
          variant: "destructive",
        });
        if (data.results) {
          setDeletionResults(data.results);
        }
      }
    } catch (err: any) {
      console.error("Error deleting inactive vehicles:", err);
      const errorMessage = err.message || "Failed to delete inactive vehicles";
      
      // Handle rate limit error specifically
      if (errorMessage.includes("Rate limit") || err.status === 429) {
        toast({
          title: "Rate Limit Exceeded",
          description: "Please wait 10 seconds between deletions to prevent accidental mass deletions.",
          variant: "default",
        });
      } else {
        toast({
          title: "Deletion Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchInactiveVehicles();
    }
  }, [isAdmin, daysInactive]);

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to access this feature.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Inactive Vehicles Cleanup
        </CardTitle>
        <CardDescription>
          Identify and remove vehicles that haven't sent GPS data in the specified number of days.
          The system checks both vehicle_positions and position_history for the most recent GPS data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="flex items-center gap-4">
          <label htmlFor="days-inactive" className="text-sm font-medium">
            Days Inactive:
          </label>
          <input
            id="days-inactive"
            type="number"
            min="1"
            max="365"
            value={daysInactive}
            onChange={(e) => setDaysInactive(parseInt(e.target.value) || 30)}
            className="w-20 px-3 py-1 border rounded-md"
            disabled={loading || previewLoading || isDeleting}
          />
          <Button
            onClick={fetchInactiveVehicles}
            disabled={loading || previewLoading || isDeleting}
            variant="outline"
            size="sm"
          >
            {previewLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Preview
              </>
            )}
          </Button>
        </div>

        {/* Warning Alert */}
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warning:</strong> This action will permanently delete vehicles and all associated data
            (positions, trips, assignments, chat history, etc.). This cannot be undone.
          </AlertDescription>
        </Alert>

        {/* Preview Results */}
        {inactiveVehicles.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  Inactive Vehicles ({inactiveVehicles.length})
                </h3>
                <p className="text-sm text-muted-foreground">
                  Vehicles with no GPS data in the last {daysInactive} days
                </p>
              </div>
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={isDeleting}
                variant="destructive"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All ({inactiveVehicles.length})
                  </>
                )}
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Last GPS Time</TableHead>
                    <TableHead>Days Inactive</TableHead>
                    <TableHead>Has Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveVehicles.map((vehicle) => (
                    <TableRow key={vehicle.device_id}>
                      <TableCell className="font-mono text-sm">
                        {vehicle.device_id}
                      </TableCell>
                      <TableCell>{vehicle.device_name}</TableCell>
                      <TableCell>
                        {vehicle.last_gps_time && vehicle.last_gps_time !== "1970-01-01T00:00:00Z" ? (
                          formatLagos(new Date(vehicle.last_gps_time), "MMM dd, yyyy HH:mm")
                        ) : (
                          <Badge variant="secondary">Never</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          {vehicle.days_inactive_count} days
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {vehicle.has_position_record && (
                            <Badge variant="outline" className="text-xs">Position</Badge>
                          )}
                          {vehicle.has_history_record && (
                            <Badge variant="outline" className="text-xs">History</Badge>
                          )}
                          {!vehicle.has_position_record && !vehicle.has_history_record && (
                            <Badge variant="secondary" className="text-xs">None</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* No Inactive Vehicles */}
        {inactiveVehicles.length === 0 && !previewLoading && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              No inactive vehicles found. All vehicles have sent GPS data within the last {daysInactive} days.
            </AlertDescription>
          </Alert>
        )}

        {/* Deletion Results */}
        {deletionResults && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <strong>Deletion Complete:</strong> Removed {deletionResults.vehicles_deleted} vehicle(s),
              {deletionResults.assignments_deleted} assignment(s), and {deletionResults.trips_deleted} trip(s).
            </AlertDescription>
          </Alert>
        )}

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete {inactiveVehicles.length} inactive vehicle(s)?
                This will remove:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>All vehicle records</li>
                  <li>All position data (current and history)</li>
                  <li>All trip records</li>
                  <li>All vehicle assignments</li>
                  <li>All chat history and related data</li>
                </ul>
                <strong className="block mt-4 text-destructive">
                  This action cannot be undone.
                </strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Delete {inactiveVehicles.length} Vehicle(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
