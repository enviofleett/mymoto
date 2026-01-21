import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Store, CheckCircle, XCircle, Loader2, Eye } from "lucide-react";

export default function MarketplaceProviders() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");
  const { toast } = useToast();

  useEffect(() => {
    if (isAdmin) {
      fetchProviders();
    }
  }, [isAdmin, filter]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      let query = supabase.from("service_providers").select(`
        *,
        profiles!inner (
          id,
          name,
          email,
          phone
        ),
        service_categories (
          id,
          name
        )
      `);

      if (filter === "pending") {
        query = query.eq("is_approved", false);
      } else if (filter === "approved") {
        query = query.eq("is_approved", true);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setProviders(data || []);
    } catch (error: any) {
      console.error("Error fetching providers:", error);
      toast({
        title: "Error",
        description: "Failed to fetch providers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (providerId: string) => {
    try {
      const { error } = await supabase
        .from("service_providers")
        .update({ is_approved: true })
        .eq("id", providerId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Provider approved successfully",
      });

      fetchProviders();
    } catch (error: any) {
      console.error("Error approving provider:", error);
      toast({
        title: "Error",
        description: "Failed to approve provider",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (providerId: string) => {
    if (!confirm("Are you sure you want to reject this provider? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase.from("service_providers").delete().eq("id", providerId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Provider rejected and removed",
      });

      fetchProviders();
    } catch (error: any) {
      console.error("Error rejecting provider:", error);
      toast({
        title: "Error",
        description: "Failed to reject provider",
        variant: "destructive",
      });
    }
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Store className="h-8 w-8" />
              Marketplace Providers
            </h1>
            <p className="text-muted-foreground">Manage service provider approvals</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              onClick={() => setFilter("pending")}
            >
              Pending
            </Button>
            <Button
              variant={filter === "approved" ? "default" : "outline"}
              onClick={() => setFilter("approved")}
            >
              Approved
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider List</CardTitle>
            <CardDescription>
              {filter === "pending"
                ? "Providers waiting for approval"
                : filter === "approved"
                ? "Approved providers"
                : "All providers"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No providers found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell className="font-medium">{provider.business_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{provider.profiles?.email || provider.contact_email}</div>
                          <div className="text-muted-foreground">
                            {provider.contact_phone || provider.profiles?.phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {provider.service_categories?.name || (
                          <span className="text-muted-foreground">No category</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {provider.is_approved ? (
                          <Badge variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(provider.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {!provider.is_approved && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(provider.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(provider.id)}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
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
      </div>
    </DashboardLayout>
  );
}
