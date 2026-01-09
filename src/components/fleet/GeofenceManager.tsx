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
  MapPin,
  Home,
  Briefcase,
  Shield,
  Plus,
  Loader2,
  Circle
} from "lucide-react";

interface GeofenceManagerProps {
  deviceId: string;
}

interface Geofence {
  id: string;
  name: string;
  description: string | null;
  zone_type: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  is_active: boolean;
}

const ZONE_TYPE_ICONS: Record<string, any> = {
  home: Home,
  work: Briefcase,
  restricted: Shield,
  custom: MapPin
};

const ZONE_TYPE_COLORS: Record<string, string> = {
  home: 'bg-blue-100 text-blue-800 border-blue-200',
  work: 'bg-purple-100 text-purple-800 border-purple-200',
  restricted: 'bg-red-100 text-red-800 border-red-200',
  custom: 'bg-gray-100 text-gray-800 border-gray-200'
};

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
    latitude: '',
    longitude: '',
    radius_meters: '100'
  });

  useEffect(() => {
    // Geofences table doesn't exist yet - show empty state
    setLoading(false);
    setGeofences([]);
  }, [deviceId]);

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
    
    // Placeholder - geofence table needs to be created via migration
    toast({
      title: "Coming Soon",
      description: "Geofence creation will be available after database setup"
    });

    setSaving(false);
    setShowCreateDialog(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      zone_type: 'custom',
      latitude: '',
      longitude: '',
      radius_meters: '100'
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
                className={`p-4 border-l-4 ${colorClass}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${colorClass} bg-opacity-20`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm">{geofence.name}</h4>
                    {geofence.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {geofence.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <Circle className="h-3 w-3" />
                      <span>Radius: {geofence.radius_meters}m</span>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {geofence.zone_type}
                      </Badge>
                      <Badge variant={geofence.is_active ? "default" : "secondary"} className="text-xs">
                        {geofence.is_active ? 'Active' : 'Inactive'}
                      </Badge>
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

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Geofence</DialogTitle>
            <DialogDescription>
              Create a circular geofence zone to monitor vehicle movements
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

            <div className="space-y-2">
              <Label htmlFor="zone_type">Zone Type</Label>
              <Select value={formData.zone_type} onValueChange={(value) => setFormData({ ...formData, zone_type: value })}>
                <SelectTrigger id="zone_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
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
                  placeholder="e.g., 6.5244"
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
                  placeholder="e.g., 3.3792"
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
                min="50"
                max="10000"
                value={formData.radius_meters}
                onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
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
                  Creating...
                </>
              ) : (
                'Create Geofence'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}