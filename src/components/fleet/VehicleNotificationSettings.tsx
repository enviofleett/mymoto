import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Battery,
  Gauge,
  Zap,
  Power,
  MapPin,
  Clock,
  Radio,
  Wrench,
  Route,
  AlertTriangle,
  Sun,
  Bell,
  MessageSquare
} from "lucide-react";

interface VehicleNotificationPreferences {
  id?: string;
  user_id: string;
  device_id: string;
  low_battery: boolean;
  critical_battery: boolean;
  overspeeding: boolean;
  harsh_braking: boolean;
  rapid_acceleration: boolean;
  ignition_on: boolean;
  ignition_off: boolean;
  vehicle_moving: boolean;
  geofence_enter: boolean;
  geofence_exit: boolean;
  idle_too_long: boolean;
  offline: boolean;
  online: boolean;
  maintenance_due: boolean;
  trip_completed: boolean;
  anomaly_detected: boolean;
  morning_greeting: boolean;
  // AI Chat preferences (separate from push notifications)
  enable_ai_chat_ignition_on?: boolean;
  enable_ai_chat_ignition_off?: boolean;
  enable_ai_chat_vehicle_moving?: boolean;
  enable_ai_chat_low_battery?: boolean;
  enable_ai_chat_critical_battery?: boolean;
  enable_ai_chat_overspeeding?: boolean;
  enable_ai_chat_harsh_braking?: boolean;
  enable_ai_chat_rapid_acceleration?: boolean;
  enable_ai_chat_geofence_enter?: boolean;
  enable_ai_chat_geofence_exit?: boolean;
  enable_ai_chat_idle_too_long?: boolean;
  enable_ai_chat_trip_completed?: boolean;
  enable_ai_chat_offline?: boolean;
  enable_ai_chat_online?: boolean;
  enable_ai_chat_maintenance_due?: boolean;
  enable_ai_chat_anomaly_detected?: boolean;
}

interface VehicleNotificationSettingsProps {
  deviceId: string;
  userId: string;
}

const EVENT_CONFIG: Array<{
  key: keyof VehicleNotificationPreferences;
  label: string;
  description: string;
  icon: React.ElementType;
  category: 'safety' | 'status' | 'driving' | 'maintenance' | 'special';
  defaultEnabled?: boolean;
}> = [
  // Safety & Critical
  {
    key: 'critical_battery',
    label: 'Critical Battery',
    description: 'Battery drops below 10%',
    icon: Battery,
    category: 'safety',
    defaultEnabled: true
  },
  {
    key: 'low_battery',
    label: 'Low Battery Warning',
    description: 'Battery drops below 20%',
    icon: Battery,
    category: 'safety'
  },
  {
    key: 'offline',
    label: 'Vehicle Offline',
    description: 'Vehicle loses GPS connection',
    icon: Radio,
    category: 'status',
    defaultEnabled: true
  },
  {
    key: 'anomaly_detected',
    label: 'Anomaly Detected',
    description: 'Unusual vehicle behavior detected',
    icon: AlertTriangle,
    category: 'safety',
    defaultEnabled: true
  },
  
  // Driving Behavior
  {
    key: 'overspeeding',
    label: 'Overspeeding',
    description: 'Vehicle exceeds speed limit',
    icon: Gauge,
    category: 'driving'
  },
  {
    key: 'harsh_braking',
    label: 'Harsh Braking',
    description: 'Sudden hard braking detected',
    icon: Zap,
    category: 'driving'
  },
  {
    key: 'rapid_acceleration',
    label: 'Rapid Acceleration',
    description: 'Aggressive acceleration detected',
    icon: Zap,
    category: 'driving'
  },
  
  // Status & Events
  {
    key: 'ignition_on',
    label: 'Ignition Start',
    description: 'Vehicle engine starts',
    icon: Power,
    category: 'status'
  },
  {
    key: 'ignition_off',
    label: 'Power Off',
    description: 'Vehicle engine stops',
    icon: Power,
    category: 'status'
  },
  {
    key: 'vehicle_moving',
    label: 'Vehicle Moving',
    description: 'Vehicle starts moving',
    icon: Route,
    category: 'status',
    defaultEnabled: true
  },
  {
    key: 'online',
    label: 'Vehicle Online',
    description: 'Vehicle reconnects after being offline',
    icon: Radio,
    category: 'status'
  },
  {
    key: 'geofence_enter',
    label: 'Geofence Entry',
    description: 'Vehicle enters a geofence zone',
    icon: MapPin,
    category: 'status'
  },
  {
    key: 'geofence_exit',
    label: 'Geofence Exit',
    description: 'Vehicle leaves a geofence zone',
    icon: MapPin,
    category: 'status'
  },
  {
    key: 'idle_too_long',
    label: 'Extended Idle',
    description: 'Vehicle idle for extended period',
    icon: Clock,
    category: 'status'
  },
  {
    key: 'trip_completed',
    label: 'Trip Completed',
    description: 'Trip ends and summary is available',
    icon: Route,
    category: 'status'
  },
  
  // Maintenance
  {
    key: 'maintenance_due',
    label: 'Maintenance Due',
    description: 'Scheduled maintenance is due',
    icon: Wrench,
    category: 'maintenance',
    defaultEnabled: true
  },
  
  // Special Features
  {
    key: 'morning_greeting',
    label: 'Morning Greeting',
    description: 'Daily AI morning briefing at 7 AM',
    icon: Sun,
    category: 'special'
  }
];

const CATEGORY_LABELS: Record<string, string> = {
  safety: 'Safety & Critical',
  status: 'Status & Events',
  driving: 'Driving Behavior',
  maintenance: 'Maintenance',
  special: 'Special Features'
};

export function VehicleNotificationSettings({ deviceId, userId }: VehicleNotificationSettingsProps) {
  const [preferences, setPreferences] = useState<VehicleNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { permission, requestPermission, isSupported: notifSupported } = useNotifications();
  const { isSupported: pushSupported, isSubscribed, isChecking: isCheckingPush, ensureSubscribed, unsubscribe, error: pushError } =
    usePushSubscription();

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!deviceId || !userId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('vehicle_notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .eq('device_id', deviceId)
          .maybeSingle();

        // PGRST116 = no rows returned (this is expected for new vehicles)
        if (error && error.code !== 'PGRST116') {
          console.error('Database error loading preferences:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
          throw error;
        }

        if (data) {
          setPreferences(data as VehicleNotificationPreferences);
        } else {
          // Create default preferences and save them
          const defaults: VehicleNotificationPreferences = {
            user_id: userId,
            device_id: deviceId,
            low_battery: false,
            critical_battery: true,
            overspeeding: false,
            harsh_braking: false,
            rapid_acceleration: false,
            ignition_on: false,
            ignition_off: false,
            vehicle_moving: true,
            geofence_enter: false,
            geofence_exit: false,
            idle_too_long: false,
            offline: true,
            online: false,
            maintenance_due: true,
            trip_completed: false,
            anomaly_detected: true,
            morning_greeting: false
          };
          
          // Save defaults to database
          const { error: insertError } = await supabase
            .from('vehicle_notification_preferences')
            .insert(defaults)
            .select()
            .single();

          if (insertError) {
            console.error('Error saving default preferences:', {
              code: insertError.code,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint
            });
            // Still set preferences in state even if save fails
            setPreferences(defaults);
            toast({
              title: "Warning",
              description: "Preferences loaded but couldn't be saved. Please try again.",
              variant: "destructive"
            });
          } else {
            setPreferences(defaults);
          }
        }
      } catch (error: any) {
        console.error('Error loading notification preferences:', {
          error,
          errorCode: error?.code,
          errorMessage: error?.message,
          errorDetails: error?.details,
          errorHint: error?.hint,
          deviceId,
          userId
        });
        
        // Provide more helpful error messages
        let errorMessage = 'Unknown error';
        if (error?.code === 'PGRST301' || error?.message?.includes('permission denied')) {
          errorMessage = 'Permission denied. Please check RLS policies.';
        } else if (error?.code === '23503' || error?.message?.includes('foreign key')) {
          errorMessage = 'Vehicle not found. Please ensure the vehicle exists.';
        } else if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
          errorMessage = 'Table not found. Please run the database migration.';
        } else {
          errorMessage = error?.message || error?.details || 'Unknown error';
        }
        
        toast({
          title: "Error",
          description: `Failed to load notification preferences: ${errorMessage}`,
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [deviceId, userId, toast]);

  // Update preference
  const updatePreference = useCallback(async (
    key: keyof VehicleNotificationPreferences,
    value: boolean
  ) => {
    if (!preferences) return;

    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setSaving(true);

    try {
      const { error } = await supabase
        .from('vehicle_notification_preferences')
        .upsert({
          ...updated,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,device_id'
        });

      if (error) throw error;

      toast({
        title: "Settings Updated",
        description: "Notification preference saved successfully"
      });
    } catch (error) {
      console.error('Error saving preference:', error);
      // Revert on error
      setPreferences(preferences);
      toast({
        title: "Error",
        description: "Failed to save notification preference",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  }, [preferences, toast]);

  // Group events by category
  const eventsByCategory = EVENT_CONFIG.reduce((acc, event) => {
    if (!acc[event.category]) {
      acc[event.category] = [];
    }
    acc[event.category].push(event);
    return acc;
  }, {} as Record<string, typeof EVENT_CONFIG>);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Failed to load notification preferences</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Proactive Notifications
        </CardTitle>
        <CardDescription>
          Choose which notifications you want to receive for this vehicle
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Device-level push enablement (background notifications) */}
        {notifSupported && pushSupported && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Background Push (This Device)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {permission !== "granted"
                    ? "Grant notification permission to receive alerts in the background."
                    : isCheckingPush
                      ? "Checking subscription..."
                      : isSubscribed
                        ? "Subscribed for background notifications."
                        : "Not subscribed yet."}
                </div>
                {pushError ? <div className="text-xs text-destructive mt-1">Push error: {pushError}</div> : null}
              </div>
              {permission !== "granted" ? (
                <Switch
                  checked={false}
                  onCheckedChange={async (checked) => {
                    if (!checked) return;
                    const ok = await requestPermission();
                    if (ok) {
                      try {
                        await ensureSubscribed();
                        toast({ title: "Enabled", description: "Background notifications enabled on this device." });
                      } catch (e: any) {
                        toast({
                          title: "Subscription Failed",
                          description: e instanceof Error ? e.message : "Please try again.",
                          variant: "destructive",
                        });
                      }
                    }
                  }}
                />
              ) : isSubscribed ? (
                <Switch
                  checked={true}
                  onCheckedChange={async (checked) => {
                    if (checked) return;
                    await unsubscribe();
                    toast({ title: "Disabled", description: "Background notifications disabled on this device." });
                  }}
                />
              ) : (
                <Switch
                  checked={false}
                  onCheckedChange={async (checked) => {
                    if (!checked) return;
                    await ensureSubscribed();
                    toast({ title: "Enabled", description: "Background notifications enabled on this device." });
                  }}
                />
              )}
            </div>
          </div>
        )}

        {Object.entries(eventsByCategory).map(([category, events]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {CATEGORY_LABELS[category]}
              </h3>
              <Separator className="flex-1" />
            </div>
            
            <div className="space-y-3">
              {events.map((event) => {
                const Icon = event.icon;
                const pushValue = preferences[event.key] as boolean;
                const aiChatKey = `enable_ai_chat_${event.key}` as keyof VehicleNotificationPreferences;
                const aiChatValue = (preferences[aiChatKey] as boolean) ?? false;
                
                return (
                  <div
                    key={event.key}
                    className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-background shadow-sm">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-sm font-medium text-foreground">
                          {event.label}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {event.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Separate toggles for Push Notifications and AI Chat */}
                    <div className="space-y-2 pl-11">
                      {/* Push Notifications Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label
                            htmlFor={`push-${event.key}`}
                            className="text-xs text-muted-foreground cursor-pointer"
                          >
                            Push Notification
                          </Label>
                        </div>
                        <Switch
                          id={`push-${event.key}`}
                          checked={pushValue}
                          onCheckedChange={(checked) => updatePreference(event.key, checked)}
                          disabled={saving}
                        />
                      </div>
                      
                      {/* AI Chat Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label
                            htmlFor={`aichat-${event.key}`}
                            className="text-xs text-muted-foreground cursor-pointer"
                          >
                            AI Chat Message
                          </Label>
                        </div>
                        <Switch
                          id={`aichat-${event.key}`}
                          checked={aiChatValue}
                          onCheckedChange={(checked) => updatePreference(aiChatKey, checked)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        
        <div className="pt-4 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground">
            💡 <strong>Tip:</strong> Critical alerts (battery, offline, anomalies) are enabled by default for safety.
            You can disable them if you prefer fewer notifications.
          </p>
          <p className="text-xs text-muted-foreground">
            📱 <strong>Push Notifications</strong> send alerts to your device. <strong>AI Chat Messages</strong> create conversational messages in the vehicle chat.
            You can enable either or both independently.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
