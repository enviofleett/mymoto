import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FleetStats {
  total: number;
  online: number;
  moving: number;
  lowBattery: number;
  overspeeding: number;
  unassigned: number;
}

export function FleetInsights() {
  const [insight, setInsight] = useState<string | null>(null);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('fleet-insights');

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setInsight(data.insight);
      setStats(data.stats);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching fleet insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Fleet Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchInsights}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading && !insight ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing fleet health...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive py-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        ) : insight ? (
          <p className="text-sm leading-relaxed">{insight}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
