import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Clock, BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatLagos } from "@/lib/timezone";
import { Button } from "@/components/ui/button";

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

export function InsightHistory({ limit = 10 }: { limit?: number }) {
  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("fleet_insights_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching insights:", error);
      } else {
        setInsights((data as InsightRecord[]) || []);
      }
    } catch (err) {
      console.error("Exception fetching insights:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [limit]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInsights();
  };

  if (loading && !refreshing) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Recent AI analysis reports
        </p>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={refreshing}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {insights.length > 0 ? (
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {insights.map((insight) => (
              <Card key={insight.id} className="bg-muted/30 border-none shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-1 rounded-md border">
                      {formatLagos(new Date(insight.created_at), "MMM d, h:mm a")}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider">
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {insight.vehicles_analyzed} Vehicles
                      </span>
                      {insight.alerts_count > 0 && (
                        <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {insight.alerts_count} Alerts
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {insight.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No insights generated yet</p>
          <p className="text-xs mt-1">AI analysis reports will appear here</p>
        </div>
      )}
    </div>
  );
}
