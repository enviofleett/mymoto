import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ParkingCircle,
  Zap,
  Tag,
  Edit2,
  Loader2,
  Clock,
  TrendingUp,
  Calendar
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LearnedLocationsProps {
  deviceId: string;
}

interface LearnedLocation {
  id: string;
  location_name: string | null;
  location_type: string;
  custom_label: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  visit_count: number;
  total_duration_minutes: number;
  last_visit_at: string | null;
  visits_per_week: number | null;
  confidence_score: number;
  tags: string[];
}

const LOCATION_TYPE_ICONS: Record<string, any> = {
  home: Home,
  work: Briefcase,
  parking: ParkingCircle,
  charging: Zap,
  frequent: MapPin,
  custom: Tag,
  unknown: MapPin
};

const LOCATION_TYPE_COLORS: Record<string, string> = {
  home: 'bg-blue-100 text-blue-800 border-blue-200',
  work: 'bg-purple-100 text-purple-800 border-purple-200',
  parking: 'bg-gray-100 text-gray-800 border-gray-200',
  charging: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  frequent: 'bg-green-100 text-green-800 border-green-200',
  custom: 'bg-pink-100 text-pink-800 border-pink-200',
  unknown: 'bg-slate-100 text-slate-800 border-slate-200'
};

export function LearnedLocations({ deviceId }: LearnedLocationsProps) {
  const [locations, setLocations] = useState<LearnedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState<LearnedLocation | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLearnedLocations();
  }, [deviceId]);

  const fetchLearnedLocations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_learned_locations', {
        p_device_id: deviceId,
        p_limit: 20
      });

      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error('Error fetching learned locations:', err);
      toast({
        title: "Error",
        description: "Failed to load learned locations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (location: LearnedLocation) => {
    setEditingLocation(location);
    setCustomLabel(location.custom_label || "");
    setSelectedType(location.location_type);
  };

  const handleSave = async () => {
    if (!editingLocation) return;

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('name_learned_location', {
        p_location_id: editingLocation.id,
        p_custom_label: customLabel.trim() || null,
        p_location_type: selectedType
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Location updated successfully"
      });

      setEditingLocation(null);
      setCustomLabel("");
      setSelectedType("");
      await fetchLearnedLocations();
    } catch (err) {
      console.error('Error updating location:', err);
      toast({
        title: "Error",
        description: "Failed to update location",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading learned locations...
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No learned locations yet</p>
        <p className="text-xs mt-1">
          Locations will be learned automatically as the vehicle parks at the same places
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {locations.map((location) => {
          const Icon = LOCATION_TYPE_ICONS[location.location_type] || MapPin;
          const colorClass = LOCATION_TYPE_COLORS[location.location_type] || LOCATION_TYPE_COLORS.unknown;
          const displayName = location.custom_label || location.location_name || `${location.location_type} Location`;
          const lastVisit = location.last_visit_at
            ? formatDistanceToNow(new Date(location.last_visit_at), { addSuffix: true })
            : 'Never';
          const avgDuration = Math.round(location.total_duration_minutes / location.visit_count);

          return (
            <Card
              key={location.id}
              className={`p-4 border-l-4 ${colorClass}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${colorClass} bg-opacity-20`}>
                  <Icon className={`h-5 w-5`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <h4 className="font-semibold text-sm leading-tight">
                        {displayName}
                      </h4>
                      {location.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {location.address}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(location)}
                      className="h-7 w-7 p-0 shrink-0"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-2">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>{location.visit_count} visits</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Avg {formatDuration(avgDuration)}</span>
                    </div>
                    <div className="flex items-center gap-1 col-span-2">
                      <Calendar className="h-3 w-3" />
                      <span>Last visit: {lastVisit}</span>
                    </div>
                    {location.visits_per_week !== null && (
                      <div className="flex items-center gap-1 col-span-2">
                        <TrendingUp className="h-3 w-3" />
                        <span>{location.visits_per_week.toFixed(1)} visits/week</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {location.location_type}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {(location.confidence_score * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>

                  {/* Google Maps Link */}
                  <a
                    href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
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
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingLocation} onOpenChange={(open) => !open && setEditingLocation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
            <DialogDescription>
              Customize the name and type for this learned location
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-label">Custom Name</Label>
              <Input
                id="custom-label"
                placeholder="e.g., Home, Office, Favorite Parking"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use auto-generated name
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-type">Location Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger id="location-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      <span>Home</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="work">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      <span>Work</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="parking">
                    <div className="flex items-center gap-2">
                      <ParkingCircle className="h-4 w-4" />
                      <span>Parking</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="charging">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <span>Charging Station</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="frequent">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>Frequent Stop</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span>Custom</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingLocation && (
              <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted rounded-md">
                <p><strong>Visits:</strong> {editingLocation.visit_count}</p>
                <p><strong>Total Time:</strong> {formatDuration(editingLocation.total_duration_minutes)}</p>
                <p><strong>Coordinates:</strong> {editingLocation.latitude.toFixed(6)}, {editingLocation.longitude.toFixed(6)}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingLocation(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
