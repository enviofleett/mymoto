import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Database, Download, Loader2, Check, AlertCircle, History, Calendar } from "lucide-react";
import { format, subDays } from "date-fns";

interface Vehicle {
  device_id: string;
  device_name: string;
  last_synced_at: string | null;
}

interface BackfillResult {
  device_id: string;
  device_name: string;
  success: boolean;
  message: string;
  records_found?: number;
  records_inserted?: number;
  records_skipped?: number;
  trips_detected?: number;
  error?: string;
}

export function DataBackfillCard() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [daysBack, setDaysBack] = useState<string>("7");
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [detectTrips, setDetectTrips] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [results, setResults] = useState<BackfillResult[]>([]);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    setLoadingVehicles(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select("device_id, device_name, last_synced_at")
      .order("device_name");

    if (error) {
      console.error("Error fetching vehicles:", error);
    } else {
      setVehicles(data || []);
    }
    setLoadingVehicles(false);
  };

  const runBackfill = async () => {
    if (!selectedDevice && selectedDevice !== "all") {
      toast({
        title: "Select a vehicle",
        description: "Please select a vehicle or 'All Vehicles' to backfill",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);

    const devicesToBackfill = selectedDevice === "all" 
      ? vehicles 
      : vehicles.filter(v => v.device_id === selectedDevice);

    const newResults: BackfillResult[] = [];

    for (const vehicle of devicesToBackfill) {
      try {
        const { data, error } = await supabase.functions.invoke("gps-history-backfill", {
          body: {
            device_id: vehicle.device_id,
            days_back: parseInt(daysBack, 10),
            force_overwrite: forceOverwrite,
            detect_trips: detectTrips,
          },
        });

        if (error) {
          newResults.push({
            device_id: vehicle.device_id,
            device_name: vehicle.device_name,
            success: false,
            message: "Function invocation failed",
            error: error.message,
          });
        } else if (data?.success) {
          newResults.push({
            device_id: vehicle.device_id,
            device_name: vehicle.device_name,
            success: true,
            message: data.message,
            records_found: data.records_found,
            records_inserted: data.records_inserted,
            records_skipped: data.records_skipped,
            trips_detected: data.trips_detected,
          });
        } else {
          newResults.push({
            device_id: vehicle.device_id,
            device_name: vehicle.device_name,
            success: false,
            message: data?.message || "Unknown error",
            error: data?.error,
          });
        }
      } catch (err) {
        newResults.push({
          device_id: vehicle.device_id,
          device_name: vehicle.device_name,
          success: false,
          message: "Request failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Update results incrementally
      setResults([...newResults]);
    }

    setLoading(false);

    const successCount = newResults.filter(r => r.success).length;
    const totalRecords = newResults.reduce((sum, r) => sum + (r.records_inserted || 0), 0);
    const totalTrips = newResults.reduce((sum, r) => sum + (r.trips_detected || 0), 0);

    toast({
      title: "Backfill Complete",
      description: `${successCount}/${devicesToBackfill.length} vehicles processed. ${totalRecords} records inserted, ${totalTrips} trips detected.`,
    });
  };

  const dateRange = {
    start: format(subDays(new Date(), parseInt(daysBack, 10)), "MMM d, yyyy"),
    end: format(new Date(), "MMM d, yyyy"),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          GPS History Backfill
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fetch historical GPS track data from GPS51 and populate position_history for better AI context.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Vehicle Selection */}
          <div className="space-y-2">
            <Label htmlFor="vehicle">Vehicle</Label>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger id="vehicle" disabled={loadingVehicles}>
                <SelectValue placeholder={loadingVehicles ? "Loading..." : "Select vehicle"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles ({vehicles.length})</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.device_id} value={v.device_id}>
                    {v.device_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Days Back */}
          <div className="space-y-2">
            <Label htmlFor="days">Days to Backfill</Label>
            <Select value={daysBack} onValueChange={setDaysBack}>
              <SelectTrigger id="days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days (max)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateRange.start} to {dateRange.end}
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="detectTrips"
              checked={detectTrips}
              onCheckedChange={setDetectTrips}
            />
            <Label htmlFor="detectTrips" className="text-sm">
              Auto-detect trips
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="forceOverwrite"
              checked={forceOverwrite}
              onCheckedChange={setForceOverwrite}
            />
            <Label htmlFor="forceOverwrite" className="text-sm text-muted-foreground">
              Overwrite existing records
            </Label>
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={runBackfill}
          disabled={loading || !selectedDevice}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Backfilling...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Start Backfill
            </>
          )}
        </Button>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Results
            </Label>
            <ScrollArea className="h-[200px] rounded-md border border-border p-2">
              <div className="space-y-2">
                {results.map((result) => (
                  <div
                    key={result.device_id}
                    className={`p-3 rounded-lg text-sm ${
                      result.success
                        ? "bg-green-500/10 border border-green-500/20"
                        : "bg-destructive/10 border border-destructive/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        <span className="font-medium">{result.device_name}</span>
                      </div>
                      {result.success && (
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {result.records_inserted} inserted
                          </Badge>
                          {result.trips_detected !== undefined && result.trips_detected > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {result.trips_detected} trips
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.success
                        ? `Found ${result.records_found} records, skipped ${result.records_skipped}`
                        : result.error || result.message}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
