import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Database, Download, Loader2, Check, AlertCircle, History, Calendar, Search, X } from "lucide-react";
import { formatLagos } from "@/lib/timezone";

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
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
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
    const { data, error } = await (supabase as any)
      .from("vehicles")
      .select("device_id, device_name, last_synced_at")
      .order("device_name");

    if (error) {
      console.error("Error fetching vehicles:", error);
    } else {
      setVehicles((data || []) as Vehicle[]);
    }
    setLoadingVehicles(false);
  };

  // Filter vehicles based on search query
  const filteredVehicles = useMemo(() => {
    if (!searchQuery.trim()) return vehicles;
    const query = searchQuery.toLowerCase();
    return vehicles.filter(v => 
      v.device_name.toLowerCase().includes(query) ||
      v.device_id.toLowerCase().includes(query)
    );
  }, [vehicles, searchQuery]);

  // Check if all filtered vehicles are selected
  const allFilteredSelected = useMemo(() => {
    return filteredVehicles.length > 0 && filteredVehicles.every(v => selectedDevices.has(v.device_id));
  }, [filteredVehicles, selectedDevices]);

  // Toggle single vehicle selection
  const toggleVehicle = (deviceId: string) => {
    setSelectedDevices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId);
      } else {
        newSet.add(deviceId);
      }
      return newSet;
    });
  };

  // Select/deselect all filtered vehicles
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered
      setSelectedDevices(prev => {
        const newSet = new Set(prev);
        filteredVehicles.forEach(v => newSet.delete(v.device_id));
        return newSet;
      });
    } else {
      // Select all filtered
      setSelectedDevices(prev => {
        const newSet = new Set(prev);
        filteredVehicles.forEach(v => newSet.add(v.device_id));
        return newSet;
      });
    }
  };

  // Clear all selections
  const clearSelection = () => {
    setSelectedDevices(new Set());
  };

  const runBackfill = async () => {
    if (selectedDevices.size === 0) {
      toast({
        title: "Select vehicles",
        description: "Please select at least one vehicle to backfill",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);

    const devicesToBackfill = vehicles.filter(v => selectedDevices.has(v.device_id));
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

  const dateRange = (() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(daysBack, 10));
    return {
      start: formatLagos(d, "MMM d, yyyy"),
      end: formatLagos(new Date(), "MMM d, yyyy"),
    };
  })();

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

        {/* Search Bar */}
        <div className="space-y-2">
          <Label htmlFor="search">Search Vehicles</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by name or device ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Vehicle Selection with Checkboxes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Select Vehicles</Label>
            <div className="flex items-center gap-2">
              {selectedDevices.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 text-xs">
                  Clear ({selectedDevices.size})
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={toggleSelectAll}
                className="h-7 text-xs"
                disabled={loadingVehicles}
              >
                {allFilteredSelected ? "Deselect All" : "Select All"}
                {searchQuery && ` (${filteredVehicles.length})`}
              </Button>
            </div>
          </div>
          
          <ScrollArea className="h-[180px] rounded-md border border-border">
            {loadingVehicles ? (
              <div className="flex items-center justify-center h-full p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-4 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No vehicles found</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredVehicles.map((v) => (
                  <label
                    key={v.device_id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                      selectedDevices.has(v.device_id)
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={selectedDevices.has(v.device_id)}
                      onCheckedChange={() => toggleVehicle(v.device_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.device_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{v.device_id}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
          
          {selectedDevices.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedDevices.size} vehicle{selectedDevices.size !== 1 ? "s" : ""} selected
            </p>
          )}
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
          disabled={loading || selectedDevices.size === 0}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Backfilling {selectedDevices.size} vehicle{selectedDevices.size !== 1 ? "s" : ""}...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Start Backfill ({selectedDevices.size} selected)
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
                    key={result?.device_id || 'unknown'}
                    className={`p-3 rounded-lg text-sm ${
                      result?.success
                        ? "bg-green-500/10 border border-green-500/20"
                        : "bg-destructive/10 border border-destructive/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {result?.success ? (
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                        )}
                        <span className="font-medium">{result?.device_name || 'Unknown'}</span>
                      </div>
                      {result?.success && (
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
                      {result?.success
                        ? `Found ${result.records_found || 0} records, skipped ${result.records_skipped || 0}`
                        : result?.error || result?.message || 'Unknown error'}
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
