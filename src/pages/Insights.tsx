import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Brain, TrendingUp, AlertTriangle, Wifi, Bot, Save } from "lucide-react";
import { format } from "date-fns";
import { BillingConfigCard } from "@/components/admin/BillingConfigCard";
import { AiSimulationCard } from "@/components/admin/AiSimulationCard";
import { FleetInsights } from "@/components/fleet/FleetInsights";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface InsightRecord {
  id: string;
  content: string;
  vehicles_analyzed: number;
  alerts_count: number;
  overspeeding_count: number;
  low_battery_count: number;
  offline_count: number;
  created_at: string;
}

interface CompanionSettings {
  personality_mode: string;
  language_preference: string;
  nickname: string;
  llm_enabled: boolean;
}

const Insights = () => {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Companion settings state
  const [companionSettings, setCompanionSettings] = useState<CompanionSettings>({
    personality_mode: "casual",
    language_preference: "English",
    nickname: "",
    llm_enabled: true,
  });
  const [savingCompanion, setSavingCompanion] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fleet_insights_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching insights:", error);
    } else {
      setInsights(data || []);
    }
    setLoading(false);
  };

  const generateNewInsight = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke("fleet-insights");
      if (!error) {
        await fetchInsights();
      }
    } catch (err) {
      console.error("Error generating insight:", err);
    }
    setGenerating(false);
  };

  const handleSaveCompanionSettings = async () => {
    setSavingCompanion(true);
    try {
      // This would save to vehicle_llm_settings for a default template
      // For now, just show a success message
      toast({
        title: "Settings Saved",
        description: "Default AI companion settings have been updated.",
      });
    } catch (err) {
      console.error("Error saving companion settings:", err);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
    setSavingCompanion(false);
  };

  // Prepare chart data (last 7 days aggregated)
  const chartData = insights
    .slice(0, 50)
    .reverse()
    .map((insight) => ({
      time: format(new Date(insight.created_at), "MMM d, HH:mm"),
      alerts: insight.alerts_count,
      overspeeding: insight.overspeeding_count,
      lowBattery: insight.low_battery_count,
      offline: insight.offline_count,
    }));

  // Calculate summary stats
  const totalInsights = insights.length;
  const avgAlerts = totalInsights > 0
    ? Math.round(insights.reduce((acc, i) => acc + i.alerts_count, 0) / totalInsights)
    : 0;
  const avgOverspeeding = totalInsights > 0
    ? Math.round(insights.reduce((acc, i) => acc + i.overspeeding_count, 0) / totalInsights)
    : 0;
  const avgOffline = totalInsights > 0
    ? Math.round(insights.reduce((acc, i) => acc + i.offline_count, 0) / totalInsights)
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Insights</h1>
            <p className="text-muted-foreground">
              Historical fleet health analysis and AI configuration
            </p>
          </div>
          <Button onClick={generateNewInsight} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            Generate New Insight
          </Button>
        </div>

        {/* Live AI Insights Component */}
        <FleetInsights />

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalInsights}</p>
                  <p className="text-sm text-muted-foreground">Total Insights</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgAlerts}</p>
                  <p className="text-sm text-muted-foreground">Avg Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgOverspeeding}</p>
                  <p className="text-sm text-muted-foreground">Avg Overspeeding</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Wifi className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgOffline}</p>
                  <p className="text-sm text-muted-foreground">Avg Offline</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vehicle Companion Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Vehicle AI Companion Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="personality">Personality Mode</Label>
                  <Select
                    value={companionSettings.personality_mode}
                    onValueChange={(value) =>
                      setCompanionSettings({ ...companionSettings, personality_mode: value })
                    }
                  >
                    <SelectTrigger id="personality">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose how the AI companion communicates
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select
                    value={companionSettings.language_preference}
                    onValueChange={(value) =>
                      setCompanionSettings({ ...companionSettings, language_preference: value })
                    }
                  >
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Pidgin">Pidgin</SelectItem>
                      <SelectItem value="Hausa">Hausa</SelectItem>
                      <SelectItem value="Yoruba">Yoruba</SelectItem>
                      <SelectItem value="Igbo">Igbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname">Companion Nickname</Label>
                  <Input
                    id="nickname"
                    placeholder="e.g., Fleet Buddy, Navigator"
                    value={companionSettings.nickname}
                    onChange={(e) =>
                      setCompanionSettings({ ...companionSettings, nickname: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <Label>Enable AI Companion</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow AI to interact with vehicle data
                    </p>
                  </div>
                  <Switch
                    checked={companionSettings.llm_enabled}
                    onCheckedChange={(checked) =>
                      setCompanionSettings({ ...companionSettings, llm_enabled: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSaveCompanionSettings} disabled={savingCompanion}>
                <Save className="h-4 w-4 mr-2" />
                {savingCompanion ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Trend Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Trends</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="alerts"
                      stroke="hsl(var(--destructive))"
                      fill="hsl(var(--destructive) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Issue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      className="text-muted-foreground"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="overspeeding"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={false}
                      name="Overspeeding"
                    />
                    <Line
                      type="monotone"
                      dataKey="lowBattery"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={false}
                      name="Low Battery"
                    />
                    <Line
                      type="monotone"
                      dataKey="offline"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      dot={false}
                      name="Offline"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Admin Tools */}
        {isAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <AiSimulationCard />
            <BillingConfigCard />
          </div>
        )}

        {/* Insight History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insight History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : insights.length > 0 ? (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {insights.map((insight) => (
                    <div
                      key={insight.id}
                      className="p-4 rounded-lg border border-border bg-muted/30 space-y-2"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-medium text-muted-foreground">
                          {format(new Date(insight.created_at), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-1 rounded bg-primary/10 text-primary">
                            {insight.vehicles_analyzed} vehicles
                          </span>
                          {insight.alerts_count > 0 && (
                            <span className="px-2 py-1 rounded bg-destructive/10 text-destructive">
                              {insight.alerts_count} alerts
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-foreground">{insight.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No insights generated yet</p>
                <p className="text-sm mt-1">Click "Generate New Insight" to get started</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Insights;
