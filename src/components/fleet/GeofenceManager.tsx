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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2 } from "lucide-react";
import { GeofenceMap } from "./GeofenceMap";
import { GeofenceList, type Geofence } from "./GeofenceList";

interface GeofenceManagerProps {
  deviceId: string;
}

interface GeofenceRule {
  id: string;
  geofence_id: string;
  device_id: string | null;
  rule_type: string;
  name: string;
  description: string | null;
  priority: number | null;
  config: any;
  is_active: boolean;
  created_at?: string;
}

export function GeofenceManager({ deviceId }: GeofenceManagerProps) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"zones" | "rules">("zones");
  const [rules, setRules] = useState<GeofenceRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<GeofenceRule | null>(null);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    zone_type: 'custom',
    latitude: 6.5244,
    longitude: 3.3792,
    radius_meters: 100,
    priority: 0,
    speed_limit_kmh: '' as number | ''
  });

  const [ruleFormData, setRuleFormData] = useState({
    geofence_id: "",
    name: "",
    description: "",
    rule_type: "",
    priority: 0,
    configText: "{}",
    is_active: true,
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

  const fetchRules = async () => {
    setRulesLoading(true);
    try {
      const { data, error } = await supabase
        .from("geofence_rules" as any)
        .select("*")
        .or(`device_id.eq.${deviceId},device_id.is.null`)
        .order("priority", { ascending: false });

      if (error) throw error;
      setRules((data as any) || []);
    } catch (error: any) {
      const code = error?.code || error?.cause?.code;
      if (code === "PGRST205") {
        setRules([]);
      } else {
        console.error("Error fetching geofence rules:", error);
        setRules([]);
      }
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    fetchGeofences();
  }, [deviceId]);

  useEffect(() => {
    fetchRules();
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
          center_point: `POINT(${formData.longitude} ${formData.latitude})`,
          center_latitude: formData.latitude,
          center_longitude: formData.longitude,
          radius_meters: formData.radius_meters,
          is_active: true,
          priority: formData.priority,
          speed_limit_kmh: formData.speed_limit_kmh === '' ? null : formData.speed_limit_kmh
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
      radius_meters: 100,
      priority: 0,
      speed_limit_kmh: ''
    });
  };

  const openCreateRuleDialog = () => {
    setEditingRule(null);
    setRuleFormData({
      geofence_id: geofences[0]?.id || "",
      name: "",
      description: "",
      rule_type: "",
      priority: 0,
      configText: "{}",
      is_active: true,
    });
    setShowRuleDialog(true);
  };

  const openEditRuleDialog = (rule: GeofenceRule) => {
    setEditingRule(rule);
    setRuleFormData({
      geofence_id: rule.geofence_id,
      name: rule.name,
      description: rule.description || "",
      rule_type: rule.rule_type,
      priority: rule.priority ?? 0,
      configText: JSON.stringify(rule.config || {}, null, 2),
      is_active: rule.is_active,
    });
    setShowRuleDialog(true);
  };

  const handleSaveRule = async () => {
    if (!ruleFormData.geofence_id || !ruleFormData.name || !ruleFormData.rule_type) {
      toast({
        title: "Validation Error",
        description: "Zone, name, and rule type are required",
        variant: "destructive",
      });
      return;
    }

    let parsedConfig: any = {};
    if (ruleFormData.configText.trim()) {
      try {
        parsedConfig = JSON.parse(ruleFormData.configText);
      } catch (error) {
        toast({
          title: "Invalid Config",
          description: "Config must be valid JSON.",
          variant: "destructive",
        });
        return;
      }
    }

    setSavingRule(true);
    try {
      const payload: any = {
        geofence_id: ruleFormData.geofence_id,
        device_id: deviceId,
        rule_type: ruleFormData.rule_type,
        name: ruleFormData.name,
        description: ruleFormData.description || null,
        priority: ruleFormData.priority,
        config: parsedConfig,
        is_active: ruleFormData.is_active,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("geofence_rules" as any)
          .update(payload)
          .eq("id", editingRule.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("geofence_rules" as any)
          .insert(payload);

        if (error) throw error;
      }

      toast({
        title: "Rule Saved",
        description: "Geofence rule has been saved successfully.",
      });

      setShowRuleDialog(false);
      fetchRules();
    } catch (error: any) {
      console.error("Error saving geofence rule:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save rule",
        variant: "destructive",
      });
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const { error } = await supabase
        .from("geofence_rules" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Rule Deleted",
        description: "Geofence rule has been removed.",
      });

      fetchRules();
    } catch (error: any) {
      console.error("Error deleting geofence rule:", error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete rule",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "zones" | "rules")}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base">Geofences</h3>
              <p className="text-xs text-muted-foreground">
                Manage zones and automation rules for this vehicle
              </p>
            </div>
            <TabsList className="bg-muted/60">
              <TabsTrigger value="zones" className="text-xs px-3">
                Zones
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-xs px-3">
                Rules
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="zones" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">
                Zones define the geographic areas used by alerts and rules.
              </p>
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
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">
                Rules control behaviors like parking limits and time-based access for each zone.
              </p>
              <Button size="sm" onClick={openCreateRuleDialog} disabled={geofences.length === 0}>
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </div>

            {geofences.length === 0 ? (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
                Create at least one zone before adding rules.
              </div>
            ) : rulesLoading ? (
              <div className="text-xs text-muted-foreground">Loading rules...</div>
            ) : rules.length === 0 ? (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
                No rules configured yet. Add a rule to automate parking limits or time-based restrictions.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => {
                  const zone = geofences.find((g) => g.id === rule.geofence_id);
                  return (
                    <div
                      key={rule.id}
                      className="flex items-start justify-between rounded-md border bg-card px-3 py-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            {rule.rule_type}
                          </span>
                          <span className="rounded-full px-2 py-0.5 text-[10px] border">
                            {rule.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          <span>
                            Zone: {zone?.name || "Unknown"} • Priority: {rule.priority ?? 0}
                          </span>
                        </div>
                        {rule.description && (
                          <div className="text-muted-foreground line-clamp-2">
                            {rule.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditRuleDialog(rule)}>
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/40"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="priority">Zone Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        priority: Number.isNaN(parseInt(e.target.value, 10))
                          ? 0
                          : parseInt(e.target.value, 10),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="speed_limit_kmh">Speed Limit (km/h)</Label>
                  <Input
                    id="speed_limit_kmh"
                    type="number"
                    placeholder="Optional"
                    value={formData.speed_limit_kmh}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({
                        ...formData,
                        speed_limit_kmh:
                          value === ''
                            ? ''
                            : parseInt(value, 10),
                      });
                    }}
                  />
                </div>
              </div>
              
              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium mb-1">Coordinates:</p>
                <p>Lat: {formData.latitude.toFixed(6)}</p>
                <p>Lng: {formData.longitude.toFixed(6)}</p>
                <p>Radius: {formData.radius_meters}m</p>
                 <p>Priority: {formData.priority}</p>
                 <p>
                   Speed Limit:{' '}
                   {formData.speed_limit_kmh === ''
                     ? 'None'
                     : `${formData.speed_limit_kmh} km/h`}
                 </p>
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

      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Create Rule"}</DialogTitle>
            <DialogDescription>
              Define rules like parking limits or time-based access for a geofence zone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rule_geofence">Zone *</Label>
              <Select
                value={ruleFormData.geofence_id}
                onValueChange={(value) =>
                  setRuleFormData((prev) => ({ ...prev, geofence_id: value }))
                }
              >
                <SelectTrigger id="rule_geofence">
                  <SelectValue placeholder="Select zone" />
                </SelectTrigger>
                <SelectContent>
                  {geofences.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule_name">Rule Name *</Label>
              <Input
                id="rule_name"
                placeholder="e.g., Office parking limit"
                value={ruleFormData.name}
                onChange={(e) =>
                  setRuleFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule_type">Rule Type *</Label>
              <Input
                id="rule_type"
                placeholder="e.g., parking_limit, time_window"
                value={ruleFormData.rule_type}
                onChange={(e) =>
                  setRuleFormData((prev) => ({ ...prev, rule_type: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule_priority">Priority</Label>
              <Input
                id="rule_priority"
                type="number"
                value={ruleFormData.priority}
                onChange={(e) =>
                  setRuleFormData((prev) => ({
                    ...prev,
                    priority: Number.isNaN(parseInt(e.target.value, 10))
                      ? 0
                      : parseInt(e.target.value, 10),
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule_description">Description</Label>
              <Textarea
                id="rule_description"
                placeholder="Optional description of what this rule does"
                value={ruleFormData.description}
                onChange={(e) =>
                  setRuleFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="rule_config">Config JSON</Label>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Active</span>
                  <Switch
                    checked={ruleFormData.is_active}
                    onCheckedChange={(checked) =>
                      setRuleFormData((prev) => ({ ...prev, is_active: checked }))
                    }
                  />
                </div>
              </div>
              <Textarea
                id="rule_config"
                value={ruleFormData.configText}
                onChange={(e) =>
                  setRuleFormData((prev) => ({ ...prev, configText: e.target.value }))
                }
                rows={6}
                className="font-mono text-xs"
                placeholder={`Examples:\n{"max_minutes": 30}\n{"start_time": "08:00", "end_time": "18:00", "days_of_week": ["Mon","Tue","Wed","Thu","Fri"]}`}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRuleDialog(false)}
              disabled={savingRule}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveRule} disabled={savingRule}>
              {savingRule ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
