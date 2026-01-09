import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  MapPin,
  Home,
  Briefcase,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Bell,
  BellOff,
  Circle,
  CheckCircle,
  XCircle
} from "lucide-react";

interface GeofenceManagerProps {
  deviceId: string;
}

interface Geofence {
  id: string;
  name: string;
  description: string | null;
  zone_type: string;
  shape_type: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  alert_on: string;
  alert_enabled: boolean;
  is_active: boolean;
  device_id: string | null;
  applies_to_all: boolean;
  created_at: string;
}

const ZONE_TYPE_ICONS: Record<string, any> = {
  home: Home,
  work: Briefcase,
  restricted: Shield,
  safe: CheckCircle,
  custom: MapPin
};

const ZONE_TYPE_COLORS: Record<string, string> = {
  home: 'bg-blue-100 text-blue-800 border-blue-200',
  work: 'bg-purple-100 text-purple-800 border-purple-200',
  restricted: 'bg-red-100 text-red-800 border-red-200',
  safe: 'bg-green-100 text-green-800 border-green-200',
  custom: 'bg-gray-100 text-gray-800 border-gray-200'
};

export function GeofenceManager({ deviceId }: GeofenceManagerProps) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingGeofence, setEditingGeofence] = useState<Geofence | null>(null);
  const [deletingGeofence, setDeletingGeofence] = useState<Geofence | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    zone_type: 'custom',
    latitude: '',
    longitude: '',
    radius_meters: '100',
    alert_on: 'both',
    alert_enabled: true
  });

  useEffect(() => {
    fetchGeofences();
  }, [deviceId]);

  const fetchGeofences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_geofences', {
        p_device_id: deviceId,
        p_include_inactive: true
      });

      if (error) throw error;
      setGeofences(data || []);
    } catch (err) {
      console.error('Error fetching geofences:', err);
      toast({
        title: "Error",
        description: "Failed to load geofences",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.latitude || !formData.longitude) {
      toast({
        title: "Validation Error",
        description: "Name, latitude, and longitude are required",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('create_circular_geofence', {
        p_name: formData.name,
        p_latitude: parseFloat(formData.latitude),
        p_longitude: parseFloat(formData.longitude),
        p_radius_meters: parseInt(formData.radius_meters, 10),
        p_description: formData.description || null,
        p_zone_type: formData.zone_type,
        p_device_id: deviceId,
        p_user_id: user.id
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Geofence created successfully"
      });

      setShowCreateDialog(false);
      resetForm();
      await fetchGeofences();
    } catch (err) {
      console.error('Error creating geofence:', err);
      toast({
        title: "Error",
        description: "Failed to create geofence",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingGeofence) return;

    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_geofence', {
        p_geofence_id: editingGeofence.id,
        p_name: formData.name || null,
        p_description: formData.description || null,
        p_alert_on: formData.alert_on as any,
        p_alert_enabled: formData.alert_enabled,
        p_is_active: null
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Geofence updated successfully"
      });

      setEditingGeofence(null);
      resetForm();
      await fetchGeofences();
    } catch (err) {
      console.error('Error updating geofence:', err);
      toast({
        title: "Error",
        description: "Failed to update geofence",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingGeofence) return;

    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_geofence', {
        p_geofence_id: deletingGeofence.id
      });

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Geofence has been deleted"
      });

      setDeletingGeofence(null);
      await fetchGeofences();
    } catch (err) {
      console.error('Error deleting geofence:', err);
      toast({
        title: "Error",
        description: "Failed to delete geofence",
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (geofence: Geofence) => {
    try {
      const { error } = await supabase.rpc('update_geofence', {
        p_geofence_id: geofence.id,
        p_name: null,
        p_description: null,
        p_alert_on: null,
        p_alert_enabled: null,
        p_is_active: !geofence.is_active
      });

      if (error) throw error;

      toast({
        title: geofence.is_active ? "Deactivated" : "Activated",
        description: `Geofence ${geofence.is_active ? 'deactivated' : 'activated'} successfully`
      });

      await fetchGeofences();
    } catch (err) {
      console.error('Error toggling geofence:', err);
      toast({
        title: "Error",
        description: "Failed to update geofence",
        variant: "destructive"
      });
    }
  };

  const openEditDialog = (geofence: Geofence) => {
    setFormData({
      name: geofence.name,
      description: geofence.description || '',
      zone_type: geofence.zone_type,
      latitude: geofence.center_latitude.toString(),
      longitude: geofence.center_longitude.toString(),
      radius_meters: geofence.radius_meters.toString(),
      alert_on: geofence.alert_on,
      alert_enabled: geofence.alert_enabled
    });
    setEditingGeofence(geofence);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      zone_type: 'custom',
      latitude: '',
      longitude: '',
      radius_meters: '100',
      alert_on: 'both',
      alert_enabled: true
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading geofences...
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Geofence Zones ({geofences.length})</h3>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowCreateDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Geofence
          </Button>
        </div>

        {geofences.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No geofences configured</p>
            <p className="text-xs mt-1">Create a geofence to monitor vehicle movements</p>
          </div>
        ) : (
          geofences.map((geofence) => {
            const Icon = ZONE_TYPE_ICONS[geofence.zone_type] || MapPin;
            const colorClass = ZONE_TYPE_COLORS[geofence.zone_type] || ZONE_TYPE_COLORS.custom;

            return (
              <Card
                key={geofence.id}
                className={`p-4 border-l-4 ${colorClass} ${!geofence.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${colorClass} bg-opacity-20`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          {geofence.name}
                          {!geofence.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </h4>
                        {geofence.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {geofence.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <Circle className="h-3 w-3" />
                        <span>Radius: {geofence.radius_meters}m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {geofence.alert_enabled ? (
                          <Bell className="h-3 w-3" />
                        ) : (
                          <BellOff className="h-3 w-3" />
                        )}
                        <span>Alerts: {geofence.alert_on}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">
                        {geofence.zone_type}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {geofence.shape_type}
                      </Badge>
                      {geofence.applies_to_all && (
                        <Badge variant="secondary" className="text-xs">
                          All Vehicles
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(geofence)}
                        className="h-7 text-xs"
                      >
                        {geofence.is_active ? (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(geofence)}
                        className="h-7 text-xs"
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingGeofence(geofence)}
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>

                    <a
                      href={`https://www.google.com/maps?q=${geofence.center_latitude},${geofence.center_longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-2 inline-block"
                    >
                      View on Google Maps →
                    </a>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingGeofence} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingGeofence(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGeofence ? 'Edit' : 'Create'} Geofence</DialogTitle>
            <DialogDescription>
              {editingGeofence
                ? 'Update geofence settings'
                : 'Create a circular geofence zone to monitor vehicle movements'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Home, Office, Warehouse"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!!editingGeofence}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            {!editingGeofence && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="zone_type">Zone Type</Label>
                  <Select value={formData.zone_type} onValueChange={(value) => setFormData({ ...formData, zone_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Home</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="restricted">Restricted</SelectItem>
                      <SelectItem value="safe">Safe Zone</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude *</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="0.000001"
                      placeholder="6.5244"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude *</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="0.000001"
                      placeholder="3.3792"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="radius">Radius (meters)</Label>
                  <Input
                    id="radius"
                    type="number"
                    min="10"
                    max="5000"
                    value={formData.radius_meters}
                    onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: 50-200m for buildings, 500-1000m for areas
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="alert_on">Alert When</Label>
              <Select value={formData.alert_on} onValueChange={(value) => setFormData({ ...formData, alert_on: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Vehicle Enters</SelectItem>
                  <SelectItem value="exit">Vehicle Exits</SelectItem>
                  <SelectItem value="both">Both Entry & Exit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="alert_enabled">Enable Alerts</Label>
              <Switch
                id="alert_enabled"
                checked={formData.alert_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, alert_enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingGeofence(null);
                resetForm();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={editingGeofence ? handleUpdate : handleCreate}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                editingGeofence ? 'Update' : 'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingGeofence} onOpenChange={(open) => !open && setDeletingGeofence(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Geofence</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingGeofence && (
                <>
                  Are you sure you want to delete the geofence "{deletingGeofence.name}"?
                  This action cannot be undone and all historical events will be removed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
