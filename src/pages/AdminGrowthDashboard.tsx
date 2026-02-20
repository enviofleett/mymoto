import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AnalyticsRow = {
  event_name: string;
  user_id: string | null;
  session_id: string;
  created_at: string;
};

export default function AdminGrowthDashboard() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["admin-growth-events"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("analytics_events")
        .select("event_name, user_id, session_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data as AnalyticsRow[]) ?? [];
    },
    enabled: isAdmin,
  });

  const metrics = useMemo(() => {
    const count = (name: string) => events.filter((e) => e.event_name === name).length;
    const uniqueSessions = (name: string) =>
      new Set(events.filter((e) => e.event_name === name).map((e) => e.session_id)).size;
    const uniqueUsers = (name: string) =>
      new Set(events.filter((e) => e.event_name === name).map((e) => e.user_id).filter(Boolean)).size;

    const landing = uniqueSessions("landing_view");
    const authSubmit = uniqueSessions("auth_submit");
    const authSuccess = uniqueUsers("auth_success");
    const firstVehicle = uniqueUsers("first_vehicle_visible");
    const firstChat = uniqueUsers("first_chat_sent");
    const pushGranted = uniqueUsers("push_permission_granted");

    const installViews = uniqueSessions("install_view");
    const installCta = uniqueSessions("install_cta_click");
    const installPrompt = uniqueSessions("install_beforeinstallprompt");
    const installAccepted = uniqueSessions("install_prompt_accepted");
    const installInstalled = uniqueSessions("install_appinstalled");
    const installErrors = count("install_error");

    return {
      landing,
      authSubmit,
      authSuccess,
      firstVehicle,
      firstChat,
      pushGranted,
      authConversionPct: landing > 0 ? ((authSubmit / landing) * 100).toFixed(1) : "0.0",
      activationPct: authSuccess > 0 ? ((firstVehicle / authSuccess) * 100).toFixed(1) : "0.0",
      firstChatPct: firstVehicle > 0 ? ((firstChat / firstVehicle) * 100).toFixed(1) : "0.0",
      pushOptInPct: authSuccess > 0 ? ((pushGranted / authSuccess) * 100).toFixed(1) : "0.0",
      totalEvents: events.length,
      authErrors: count("auth_error"),
      installViews,
      installCta,
      installPrompt,
      installAccepted,
      installInstalled,
      installErrors,
      installViewToCtaPct:
        installViews > 0 ? ((installCta / installViews) * 100).toFixed(1) : "0.0",
      installCtaToPromptPct:
        installCta > 0 ? ((installPrompt / installCta) * 100).toFixed(1) : "0.0",
      installPromptToAcceptPct:
        installPrompt > 0 ? ((installAccepted / installPrompt) * 100).toFixed(1) : "0.0",
      installAcceptToInstalledPct:
        installAccepted > 0 ? ((installInstalled / installAccepted) * 100).toFixed(1) : "0.0",
      installViewToInstalledPct:
        installViews > 0 ? ((installInstalled / installViews) * 100).toFixed(1) : "0.0",
    };
  }, [events]);

  if (authLoading) {
    return <DashboardLayout><div className="p-6">Loading...</div></DashboardLayout>;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-32">
        <h1 className="text-2xl font-bold">Growth Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last 30 days GTM funnel telemetry.</p>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle>Landing Sessions</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.landing}</CardContent></Card>
          <Card><CardHeader><CardTitle>Auth Submits</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.authSubmit}</CardContent></Card>
          <Card><CardHeader><CardTitle>Auth Success Users</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.authSuccess}</CardContent></Card>
          <Card><CardHeader><CardTitle>Vehicle Linked Users</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.firstVehicle}</CardContent></Card>
          <Card><CardHeader><CardTitle>First Chat Users</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.firstChat}</CardContent></Card>
          <Card><CardHeader><CardTitle>Push Opt-In Users</CardTitle></CardHeader><CardContent>{isLoading ? "--" : metrics.pushGranted}</CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader><CardTitle>Visitor to Auth Submit</CardTitle></CardHeader><CardContent>{`${metrics.authConversionPct}%`}</CardContent></Card>
          <Card><CardHeader><CardTitle>Auth to Vehicle Linked</CardTitle></CardHeader><CardContent>{`${metrics.activationPct}%`}</CardContent></Card>
          <Card><CardHeader><CardTitle>Vehicle Linked to First Chat</CardTitle></CardHeader><CardContent>{`${metrics.firstChatPct}%`}</CardContent></Card>
          <Card><CardHeader><CardTitle>Auth to Push Granted</CardTitle></CardHeader><CardContent>{`${metrics.pushOptInPct}%`}</CardContent></Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Install Funnel (Last 30 days)</h2>
          <p className="text-xs text-muted-foreground">
            Sessions across all platforms from /install view to successful app installation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>/install Sessions</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installViews}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>CTA Click Sessions</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installCta}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Prompt Eligible Sessions</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installPrompt}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Prompt Accepted Sessions</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installAccepted}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Installed Sessions</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installInstalled}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Install Errors</CardTitle></CardHeader>
            <CardContent>{isLoading ? "--" : metrics.installErrors}</CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>View → CTA</CardTitle></CardHeader>
            <CardContent>{`${metrics.installViewToCtaPct}%`}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>CTA → Prompt</CardTitle></CardHeader>
            <CardContent>{`${metrics.installCtaToPromptPct}%`}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Prompt → Accept</CardTitle></CardHeader>
            <CardContent>{`${metrics.installPromptToAcceptPct}%`}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Accept → Installed</CardTitle></CardHeader>
            <CardContent>{`${metrics.installAcceptToInstalledPct}%`}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>View → Installed</CardTitle></CardHeader>
            <CardContent>{`${metrics.installViewToInstalledPct}%`}</CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
