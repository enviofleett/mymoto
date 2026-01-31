import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { GeofenceMap } from "./GeofenceMap";
import { GeofenceList, type Geofence } from "./GeofenceList";

interface GeofenceManagerProps {
  deviceId: string;
}

export function GeofenceManager({ deviceId }: GeofenceManagerProps) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    zone_type: 'custom',
    latitude: 6.5244, // Default to Lagos
    longitude: 3.3792,
    radius_meters: 100
  });

  const fetchGeofences = async () => {
    try {
      const { data, error } = await supabase
        .from('geofence_zones' as any)
        .select('*')
        .or(`device_id.eq.${deviceId},device_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGeofences((data as any) || []);
    } catch (error) {
      console.error('Error fetching geofences:', error);
      // Fallback to empty if table doesn't exist yet
      setGeofences([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeofences();
  }, [deviceId]);

  const handleCreate = async () => {
    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    
    try {
      // 1. Create in local DB
      const { data, error } = await supabase
        .from('geofence_zones' as any)
        .insert({
          device_id: deviceId,
          name: formData.name,
          description: formData.description,
          zone_type: formData.zone_type,
          shape_type: 'circle',
          // Create GeoJSON Point
          center_point: `POINT(${formData.longitude} ${formData.latitude})`,
          center_latitude: formData.latitude,
          center_longitude: formData.longitude,
          radius_meters: formData.radius_meters,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Trigger Sync to GPS51 (via Edge Function)
      // We'll implement this next, for now just log it
      console.log('Geofence created locally:', data);
      
      let syncSuccess = false;
      try {
        await supabase.functions.invoke('sync-geofences-gps51', {
          body: { action: 'create', geofence_id: (data as any).id }
        });
        syncSuccess = true;
      } catch (syncError) {
        console.warn('GPS51 Sync failed:', syncError);
        // Don't block UI, just warn
      }

      toast({
        title: syncSuccess ? "Geofence Created" : "Created Locally Only",
        description: syncSuccess 
          ? "Geofence has been created and synced with the vehicle." 
          : "Geofence saved locally. Sync to vehicle failed and will retry in background.",
        variant: syncSuccess ? "default" : "destructive"
      });

      setShowCreateDialog(false);
      resetForm();
      fetchGeofences();

    } catch (error: any) {
      console.error('Error creating geofence:', error);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create geofence",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // 1. Fetch GPS51 ID before deleting
      const { data: geofence } = await supabase
        .from('geofence_zones' as any)
        .select('gps51_id')
        .eq('id', id)
        .single();

      const gps51Id = (geofence as any)?.gps51_id;

      // 2. Delete from local DB
      const { error } = await supabase
        .from('geofence_zones' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      // 3. Trigger Sync Delete
      if (gps51Id) {
        try {
          await supabase.functions.invoke('sync-geofences-gps51', {
            body: { action: 'delete', geofence_id: id, gps51_id: gps51Id }
          });
        } catch (syncError) {
          console.warn('GPS51 Sync failed:', syncError);
        }
      }

      toast({
        title: "Geofence Deleted",
        description: "Geofence has been removed."
      });

      fetchGeofences();
    } catch (error: any) {
      console.error('Error deleting geofence:', error);
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      zone_type: 'custom',
      latitude: 6.5244,
      longitude: 3.3792,
      radius_meters: 100
    });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Geofence Zones</h3>
            <p className="text-xs text-muted-foreground">Manage virtual boundaries for this vehicle</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Zone
          </Button>
        </div>

        <GeofenceList 
          geofences={geofences} 
          loading={loading} 
          onDelete={handleDelete} 
        />
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Geofence Zone</DialogTitle>
            <DialogDescription>
              Set a virtual boundary. You can configure alerts for when the vehicle enters or exits this zone.
            </DialogDescription>
          </DialogHeader>

          <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-6 py-4 overflow-y-auto">
            {/* Left Column: Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Zone Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Home, Office"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone_type">Type</Label>
                <Select value={formData.zone_type} onValueChange={(value) => setFormData({ ...formData, zone_type: value })}>
                  <SelectTrigger id="zone_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="restricted">Restricted Area</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              
              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium mb-1">Coordinates:</p>
                <p>Lat: {formData.latitude.toFixed(6)}</p>
                <p>Lng: {formData.longitude.toFixed(6)}</p>
                <p>Radius: {formData.radius_meters}m</p>
              </div>
            </div>

            {/* Right Column: Map */}
            <div className="space-y-2">
              <Label>Location & Radius</Label>
              <GeofenceMap
                initialLat={formData.latitude}
                initialLng={formData.longitude}
                initialRadius={formData.radius_meters}
                onLocationSelect={(lat, lng, radius) => {
                  setFormData(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lng,
                    radius_meters: radius
                  }));
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Syncing...
                </>
              ) : (
                'Save Zone'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}