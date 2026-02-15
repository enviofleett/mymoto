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
import { formatLagos } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveDataList } from "@/components/ui/responsive-data-list";

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
      const { data, error } = await supabase.functions.invoke("admin-process-vehicle-onboarding-request", {
        body: {
          action: "approve",
          request_id: selectedRequest.id,
          device_id: deviceId,
        },
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || "Approval failed");
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
      const { data, error } = await supabase.functions.invoke("admin-process-vehicle-onboarding-request", {
        body: {
          action: "reject",
          request_id: requestId,
        },
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || "Rejection failed");
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
              <ResponsiveDataList
                items={requests}
                desktop={
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Vehicle Info</TableHead>
                        <TableHead>Plate</TableHead>
                        <TableHead>Requested IMEI</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((request: any) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            {formatLagos(new Date(request.created_at), "MMM dd, yyyy")}
                            <div className="text-xs text-muted-foreground">
                              {formatLagos(new Date(request.created_at), "HH:mm")}
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
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {request.requested_device_id || "—"}
                            </span>
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
                                    setDeviceId(request.requested_device_id || "");
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
                }
                renderCard={(request: any) => (
                  <Card key={request.id} className="bg-card border-border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {formatLagos(new Date(request.created_at), "MMM dd, yyyy")}{" "}
                            <span className="opacity-70">{formatLagos(new Date(request.created_at), "HH:mm")}</span>
                          </div>
                          <div className="font-medium truncate">
                            {/* @ts-ignore */}
                            {request.user?.raw_user_meta_data?.full_name || request.user?.raw_user_meta_data?.name || "User"}
                          </div>
                          {/* @ts-ignore */}
                          <div className="text-xs text-muted-foreground truncate">{request.user?.email}</div>
                        </div>
                        <div className="shrink-0">{getStatusBadge(request.status)}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground text-xs">Vehicle</div>
                        <div className="text-xs truncate">{request.year} {request.make} {request.model}</div>
                        <div className="text-muted-foreground text-xs">Plate</div>
                        <div className="text-xs"><Badge variant="outline">{request.plate_number}</Badge></div>
                        <div className="text-muted-foreground text-xs">Requested IMEI</div>
                        <div className="text-xs font-mono truncate">{request.requested_device_id || "—"}</div>
                      </div>

                      {request.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("Are you sure you want to reject this request?")) {
                                rejectMutation.mutate(request.id);
                              }
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedRequest(request);
                              setDeviceId(request.requested_device_id || "");
                              setIsApproveDialogOpen(true);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Processed by Admin
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              />
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
