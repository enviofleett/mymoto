import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { 
  History, 
  MapPin, 
  Gauge, 
  Clock, 
  Navigation, 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  Truck
} from "lucide-react";
import { format, formatDistanceToNow, subDays } from "date-fns";

interface TripRecord {
  id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number | null;
  battery_percent: number | null;
  ignition_on: boolean | null;
  gps_time: string;
}

interface AssignedVehicle {
  device_id: string;
  vehicle_alias: string | null;
  device_name: string;
}

interface TripHistoryTableProps {
  deviceIds: string[];
  vehicles: AssignedVehicle[];
}

export function TripHistoryTable({ deviceIds, vehicles }: TripHistoryTableProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (deviceIds.length > 0) {
      fetchTrips();
    } else {
      setLoading(false);
    }
  }, [deviceIds, page, selectedDevice, dateRange]);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      
      const fromDate = subDays(new Date(), parseInt(dateRange)).toISOString();
      const filterDevices = selectedDevice === "all" ? deviceIds : [selectedDevice];
      
      const { data, error } = await (supabase
        .from("position_history" as any)
        .select("*")
        .in("device_id", filterDevices)
        .gte("gps_time", fromDate)
        .order("gps_time", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1) as any);

      if (error) throw error;
      
      setTrips((data || []) as TripRecord[]);
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching trip history:", err);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleName = (deviceId: string) => {
    const vehicle = vehicles.find(v => v.device_id === deviceId);
    return vehicle?.vehicle_alias || vehicle?.device_name || deviceId;
  };

  const getSpeedBadge = (speed: number) => {
    if (speed === 0) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Stopped</Badge>;
    }
    if (speed > 120) {
      return <Badge variant="destructive">{speed} km/h</Badge>;
    }
    if (speed > 80) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{speed} km/h</Badge>;
    }
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{speed} km/h</Badge>;
  };

  if (deviceIds.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8 text-center">
          <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground">No Trip Data</h3>
          <p className="text-muted-foreground mt-1">
            You need assigned vehicles to view trip history.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Trip History
            </CardTitle>
            <CardDescription>
              GPS position records for your assigned vehicles
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-[180px]">
                <Truck className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.device_id} value={v.device_id}>
                    {v.vehicle_alias || v.device_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No trip records found for this period.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead>Heading</TableHead>
                    <TableHead>Ignition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-medium">
                        {getVehicleName(trip.device_id)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(new Date(trip.gps_time), "MMM d, HH:mm")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(trip.gps_time), { addSuffix: true })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-mono">
                            {trip.latitude.toFixed(5)}, {trip.longitude.toFixed(5)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getSpeedBadge(trip.speed)}
                      </TableCell>
                      <TableCell>
                        {trip.heading !== null ? (
                          <div className="flex items-center gap-1.5">
                            <Navigation 
                              className="h-3.5 w-3.5 text-muted-foreground" 
                              style={{ transform: `rotate(${trip.heading}deg)` }}
                            />
                            <span>{trip.heading}°</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={trip.ignition_on 
                            ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                            : 'bg-muted text-muted-foreground'
                          }
                        >
                          {trip.ignition_on ? 'ON' : 'OFF'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {trips.length} records (Page {page + 1})
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
