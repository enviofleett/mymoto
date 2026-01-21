import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Store, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { useIsProvider } from "@/hooks/useIsProvider";
import { Link } from "react-router-dom";

export default function ProviderDashboard() {
  const { user } = useAuth();
  const { isProvider, isLoading } = useIsProvider();
  const [provider, setProvider] = useState<any>(null);
  const [stats, setStats] = useState({
    totalServices: 0,
    totalAppointments: 0,
    pendingAppointments: 0,
    completedAppointments: 0,
  });

  useEffect(() => {
    if (user && isProvider) {
      fetchProviderData();
    }
  }, [user, isProvider]);

  const fetchProviderData = async () => {
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    const { data: providerData } = await supabase
      .from("service_providers")
      .select("*")
      .eq("profile_id", profile.id)
      .single();

    setProvider(providerData);

    if (providerData) {
      // Fetch stats
      const { data: services } = await supabase
        .from("marketplace_services")
        .select("id", { count: "exact" })
        .eq("provider_id", providerData.id);

      const { data: appointments } = await supabase
        .from("marketplace_appointments")
        .select("id, status", { count: "exact" })
        .eq("provider_id", providerData.id);

      setStats({
        totalServices: services?.length || 0,
        totalAppointments: appointments?.length || 0,
        pendingAppointments: appointments?.filter((a) => a.status === "pending").length || 0,
        completedAppointments: appointments?.filter((a) => a.status === "completed").length || 0,
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isProvider) {
    return <Navigate to="/provider/register" replace />;
  }

  if (!provider) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">You haven't registered as a provider yet.</p>
            <Link to="/provider/register">
              <Badge>Register Now</Badge>
            </Link>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Store className="h-8 w-8" />
            Provider Dashboard
          </h1>
          <p className="text-muted-foreground">{provider.business_name}</p>
        </div>

        {/* Status Badge */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Account Status</p>
                {provider.is_approved ? (
                  <Badge className="mt-2" variant="default">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approved
                  </Badge>
                ) : (
                  <Badge className="mt-2" variant="secondary">
                    <Clock className="h-4 w-4 mr-1" />
                    Pending Approval
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalServices}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAppointments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingAppointments}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedAppointments}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Welcome to your Provider Dashboard</CardTitle>
                <CardDescription>Manage your services, appointments, and ad campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {provider.is_approved
                    ? "Your account is approved. You can now manage your services and appointments."
                    : "Your registration is pending admin approval. You'll be able to manage services once approved."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>Manage your service offerings</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Service management coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Orders & Appointments</CardTitle>
                <CardDescription>View and manage customer appointments</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Appointment management coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
