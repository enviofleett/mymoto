import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FleetVehicle } from "@/hooks/useFleetData";
import { usePositionHistory, useAvailableDrivers } from "@/hooks/useVehicleDetails";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VehicleChat } from "./VehicleChat";
import { VehiclePersonaSettings } from "./VehiclePersonaSettings";
import { RecentActivityFeed } from "./RecentActivityFeed";
import { VehicleTrips } from "./VehicleTrips";
import { VehicleMileageChart } from "./VehicleMileageChart";
import { ProactiveNotifications } from "./ProactiveNotifications";
import { LearnedLocations } from "./LearnedLocations";
import { VehicleHealthDashboard } from "./VehicleHealthDashboard";
import { CommandHistory } from "./CommandHistory";
import { GeofenceManager } from "./GeofenceManager";
import { 
  MapPin, Gauge, Battery, Power, User, Phone, 
  Calendar, AlertTriangle, Navigation, Car, UserPlus, UserMinus,
  History, Clock, Building2, MessageSquare, Settings2
} from "lucide-react";

interface VehicleDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: FleetVehicle | null;
  onAssignmentChange: () => void;
}

export function VehicleDetailsModal({ 
  open, 
  onOpenChange, 
  vehicle, 
  onAssignmentChange 
}: VehicleDetailsModalProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [llmSettings, setLlmSettings] = useState<{ nickname: string | null; avatar_url: string | null } | null>(null);
  const { toast } = useToast();

  // Use cached queries - data is often already prefetched from hover
  const { data: positionHistory = [], isLoading: historyLoading } = usePositionHistory(
    vehicle?.id || null,
    open && !!vehicle
  );

  const { data: drivers = [] } = useAvailableDrivers(
    open && !vehicle?.driver
  );

  // Fetch LLM settings for avatar and nickname
  useEffect(() => {
    if (open && vehicle?.id) {
      (supabase
        .from('vehicle_llm_settings' as any)
        .select('nickname, avatar_url')
        .eq('device_id', vehicle.id)
        .maybeSingle() as any)
        .then(({ data }: any) => {
          setLlmSettings(data);
        });
    }
  }, [open, vehicle?.id]);

  useEffect(() => {
    setShowAssignForm(false);
    setSelectedDriverId("");
  }, [open, vehicle]);

  const handleAssign = async () => {
    if (!vehicle || !selectedDriverId) return;

    setLoading(true);
    try {
      const { error } = await (supabase
        .from("vehicle_assignments" as any)
        .upsert({
          device_id: vehicle.id,
          profile_id: selectedDriverId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' }) as any);

      if (error) throw error;

      toast({ title: "Success", description: "Driver assigned successfully" });
      setShowAssignForm(false);
      setSelectedDriverId("");
      onAssignmentChange();
    } catch (err) {
      console.error("Error assigning driver:", err);
      toast({
        title: "Error",
        description: "Failed to assign driver",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async () => {
    if (!vehicle) return;

    setLoading(true);
    try {
      const { error } = await (supabase
        .from("vehicle_assignments" as any)
        .update({ profile_id: null })
        .eq("device_id", vehicle.id) as any);

      if (error) throw error;

      toast({ title: "Success", description: "Driver unassigned successfully" });
      onAssignmentChange();
    } catch (err) {
      console.error("Error unassigning driver:", err);
      toast({
        title: "Error",
        description: "Failed to unassign driver",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  const getStatusColor = () => {
    switch (vehicle.status) {
      case 'moving': return 'bg-green-500';
      case 'stopped': return 'bg-yellow-500';
      case 'offline': return 'bg-muted-foreground';
    }
  };

  const getBatteryColor = (battery: number | null) => {
    if (battery === null) return 'text-muted-foreground';
    if (battery < 20) return 'text-red-500';
    if (battery < 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {vehicle.name}
          </DialogTitle>
          {vehicle.gpsOwner && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span>Owner: {vehicle.gpsOwner}</span>
            </div>
          )}
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-11 text-xs">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="chat">AI Chat</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
            <TabsTrigger value="geofences">Geofences</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="trips">Trips</TabsTrigger>
            <TabsTrigger value="alarms">Alarms</TabsTrigger>
            <TabsTrigger value="mileage">Mileage</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="persona">Persona</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Status Overview */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
                <div>
                  <p className="font-medium capitalize">{vehicle.status}</p>
                  {vehicle.offlineDuration && (
                    <p className="text-xs text-muted-foreground">for {vehicle.offlineDuration}</p>
                  )}
                </div>
              </div>
              {vehicle.isOverspeeding && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Overspeeding
                </Badge>
              )}
            </div>

            <Separator />

            {/* Telemetry Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Gauge className="h-4 w-4" />
                  Speed
                </div>
                <p className="text-lg font-semibold">{vehicle.speed} km/h</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Navigation className="h-4 w-4" />
                  Mileage
                </div>
                <p className="text-lg font-semibold">
                  {vehicle.mileage !== null ? `${(vehicle.mileage / 1000).toFixed(1)} km` : 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <div className={`flex items-center gap-2 text-sm ${getBatteryColor(vehicle.battery)}`}>
                  <Battery className="h-4 w-4" />
                  Battery
                </div>
                <p className={`text-lg font-semibold ${getBatteryColor(vehicle.battery)}`}>
                  {vehicle.battery !== null ? `${vehicle.battery}%` : 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Power className="h-4 w-4" />
                  Ignition
                </div>
                <p className={`text-lg font-semibold ${vehicle.ignition ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {vehicle.ignition === null ? 'N/A' : vehicle.ignition ? 'ON' : 'OFF'}
                </p>
              </div>
            </div>

            <Separator />

            {/* Location */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <MapPin className="h-4 w-4" />
                Location
              </div>
              <p className="font-medium">{vehicle.location}</p>
              {vehicle.lastUpdate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Last update: {vehicle.lastUpdate.toLocaleString()}
                </p>
              )}
            </div>

            <Separator />

            {/* Driver Assignment */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <User className="h-4 w-4" />
                  Assigned Driver
                </div>
              </div>

              {vehicle.driver ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div>
                    <p className="font-medium">{vehicle.driver.name}</p>
                    {vehicle.driver.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {vehicle.driver.phone}
                      </p>
                    )}
                    {vehicle.driver.license_number && (
                      <p className="text-xs text-muted-foreground">
                        License: {vehicle.driver.license_number}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleUnassign}
                    disabled={loading}
                  >
                    <UserMinus className="h-4 w-4 mr-1" />
                    Unassign
                  </Button>
                </div>
              ) : showAssignForm ? (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-card">
                  <div className="space-y-2">
                    <Label>Select Driver</Label>
                    <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a driver..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border z-50">
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.name} {driver.phone ? `(${driver.phone})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAssignForm(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAssign} disabled={!selectedDriverId || loading}>
                      {loading ? "Assigning..." : "Assign"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setShowAssignForm(true)}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Driver
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Clock className="h-4 w-4 animate-spin mr-2" />
                  Loading history...
                </div>
              ) : positionHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mb-2" />
                  <p>No position history available</p>
                  <p className="text-xs">History will be recorded as the vehicle reports positions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {positionHistory.map((pos, index) => (
                    <div 
                      key={pos.id} 
                      className={`p-3 rounded-lg border border-border bg-card ${index === 0 ? 'ring-2 ring-primary/20' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTime(pos.gps_time)}
                        </span>
                        {index === 0 && (
                          <Badge variant="outline" className="text-xs">Latest</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">
                            {pos.latitude.toFixed(5)}, {pos.longitude.toFixed(5)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Gauge className="h-3 w-3 text-muted-foreground" />
                          <span>{pos.speed} km/h</span>
                        </div>
                        {pos.battery_percent !== null && (
                          <div className={`flex items-center gap-1 ${getBatteryColor(pos.battery_percent)}`}>
                            <Battery className="h-3 w-3" />
                            <span>{pos.battery_percent}%</span>
                          </div>
                        )}
                        {pos.ignition_on !== null && (
                          <div className={`flex items-center gap-1 ${pos.ignition_on ? 'text-green-500' : 'text-muted-foreground'}`}>
                            <Power className="h-3 w-3" />
                            <span>{pos.ignition_on ? 'ON' : 'OFF'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            <VehicleChat 
              deviceId={vehicle.id} 
              vehicleName={vehicle.name}
              avatarUrl={llmSettings?.avatar_url}
              nickname={llmSettings?.nickname}
            />
          </TabsContent>

          <TabsContent value="commands" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <CommandHistory deviceId={vehicle.id} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="geofences" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <GeofenceManager deviceId={vehicle.id} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="health" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <VehicleHealthDashboard deviceId={vehicle.id} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <LearnedLocations deviceId={vehicle.id} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="trips" className="mt-4">
            <VehicleTrips deviceId={vehicle.id} />
          </TabsContent>

          <TabsContent value="alarms" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <ProactiveNotifications deviceId={vehicle.id} limit={20} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mileage" className="mt-4">
            <VehicleMileageChart deviceId={vehicle.id} />
          </TabsContent>

          <TabsContent value="persona" className="mt-4">
            <VehiclePersonaSettings deviceId={vehicle.id} vehicleName={vehicle.name} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
