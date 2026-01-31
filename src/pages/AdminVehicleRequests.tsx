import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Clock, Search, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminVehicleRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [deviceId, setDeviceId] = useState("");
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);

  // Fetch requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["vehicle-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("vehicle_onboarding_requests" as any)
        .select("*, user:user_id(email, raw_user_meta_data)")
        .order("created_at", { ascending: false })) as any;

      if (error) throw error;
      return data;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest || !deviceId) return;

      const { data, error } = await supabase.rpc("approve_vehicle_request" as any, {
        p_request_id: selectedRequest.id,
        p_device_id: deviceId,
        p_admin_id: user?.id,
      });

      if (error) throw error;
      // @ts-ignore
      if (data && !data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      toast.success("Vehicle request approved and linked!");
      setIsApproveDialogOpen(false);
      setDeviceId("");
      setSelectedRequest(null);
      queryClient.invalidateQueries({ queryKey: ["vehicle-requests"] });
    },
    onError: (error: any) => {
      toast.error("Failed to approve: " + error.message);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("vehicle_onboarding_requests" as any)
        .update({ 
            status: "rejected", 
            processed_at: new Date().toISOString(),
            processed_by: user?.id 
        })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request rejected");
      queryClient.invalidateQueries({ queryKey: ["vehicle-requests"] });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Pending</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vehicle Onboarding Requests</h1>
          <p className="text-muted-foreground">
            Review and approve vehicle registration requests from owners.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
            <CardDescription>
              Connect these vehicles to GPS51 by providing the Device ID (IMEI).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading requests...</div>
            ) : !requests || requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No requests found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Vehicle Info</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request: any) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        {format(new Date(request.created_at), "MMM dd, yyyy")}
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                           {/* @ts-ignore */}
                          {request.user?.raw_user_meta_data?.full_name || request.user?.raw_user_meta_data?.name || "User"}
                        </div>
                         {/* @ts-ignore */}
                        <div className="text-xs text-muted-foreground">{request.user?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{request.year} {request.make} {request.model}</div>
                        {request.vin && <div className="text-xs text-muted-foreground">VIN: {request.vin}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{request.plate_number}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-right">
                        {request.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Are you sure you want to reject this request?")) {
                                  rejectMutation.mutate(request.id);
                                }
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(request);
                                setIsApproveDialogOpen(true);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                          </div>
                        )}
                        {request.status === "approved" && (
                            <div className="text-xs text-muted-foreground">
                                Processed by Admin
                            </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Vehicle Request</DialogTitle>
              <DialogDescription>
                Enter the GPS51 Device ID (IMEI) to link this vehicle.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md space-y-2">
                <div className="text-sm font-medium">Request Details:</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">User:</div>
                   {/* @ts-ignore */}
                  <div>{selectedRequest?.user?.email}</div>
                  <div className="text-muted-foreground">Vehicle:</div>
                  <div>{selectedRequest?.year} {selectedRequest?.make} {selectedRequest?.model}</div>
                  <div className="text-muted-foreground">Plate:</div>
                  <div>{selectedRequest?.plate_number}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>GPS Device ID (IMEI)</Label>
                <Input
                  placeholder="Enter 15-digit IMEI"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This ID must match the device identifier in the GPS51 platform.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => approveMutation.mutate()}
                disabled={!deviceId || approveMutation.isPending}
              >
                {approveMutation.isPending && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
