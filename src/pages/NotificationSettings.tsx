import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  Moon, 
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Info,
  Zap,
  Battery,
  Gauge,
  Power,
  MapPin,
  Radio,
  Clock,
  ChevronRight,
  Navigation,
  MessageSquare
} from "lucide-react";
import { 
  useNotificationPreferences, 
  ALERT_TYPE_LABELS, 
  ALERT_TYPE_DESCRIPTIONS,
  type AlertType,
  type SeverityLevel 
} from "@/hooks/useNotificationPreferences";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const SEVERITY_CONFIG: { 
  level: SeverityLevel; 
  label: string; 
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { 
    level: 'critical', 
    label: 'Critical', 
    description: 'Urgent alerts requiring immediate action',
    icon: AlertTriangle,
    color: 'text-red-500'
  },
  { 
    level: 'error', 
    label: 'Error', 
    description: 'Important issues that need attention',
    icon: AlertCircle,
    color: 'text-orange-500'
  },
  { 
    level: 'warning', 
    label: 'Warning', 
    description: 'Potential issues to be aware of',
    icon: AlertTriangle,
    color: 'text-yellow-500'
  },
  { 
    level: 'info', 
    label: 'Info', 
    description: 'General notifications and updates',
    icon: Info,
    color: 'text-blue-500'
  }
];

const ALERT_TYPE_ICONS: Record<AlertType, React.ElementType> = {
  low_battery: Battery,
  critical_battery: Battery,
  overspeeding: Gauge,
  harsh_braking: Zap,
  rapid_acceleration: Zap,
  ignition_on: Power,
  ignition_off: Power,
  vehicle_moving: Navigation,
  geofence_enter: MapPin,
  geofence_exit: MapPin,
  idle_too_long: Clock,
  offline: Radio,
  online: Radio,
  predictive_briefing: Navigation
};

const NotificationSettings = () => {
  const { 
    preferences, 
    setPreferences, 
    updateSeveritySettings,
    updateAlertTypeSettings,
    updateAIChatPreferences,
    resetToDefaults,
    isInQuietHours
  } = useNotificationPreferences();
  
  const { 
    permission, 
    requestPermission, 
    playAlertSound,
    isSupported
  } = useNotifications();
  
  const { toast } = useToast();

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({
        title: "Notifications Enabled",
        description: "You'll now receive push notifications for alerts"
      });
    } else {
      toast({
        title: "Permission Denied",
        description: "You can enable notifications in your browser settings",
        variant: "destructive"
      });
    }
  };

  const handleTestSound = (severity: SeverityLevel) => {
    playAlertSound(severity);
  };

  const handleReset = () => {
    resetToDefaults();
    toast({
      title: "Settings Reset",
      description: "Notification preferences have been reset to defaults"
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Notification Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Customize how you receive alerts for your vehicles
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>

        {/* Push Notification Permission */}
        {isSupported && permission !== 'granted' && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Enable Push Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    Get alerts even when the app is in the background or closed
                  </p>
                </div>
                <Button onClick={handleRequestPermission}>
                  Enable
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Master Toggles */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Master Controls</CardTitle>
            <CardDescription>
              Quick toggles to enable or disable all notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Volume2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label className="text-base">Sound Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Play sounds when alerts are received
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.soundEnabled}
                onCheckedChange={(checked) => setPreferences({ soundEnabled: checked })}
              />
            </div>

            {preferences.soundEnabled && (
              <div className="pl-12 space-y-3">
                <div className="flex items-center gap-4">
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[preferences.soundVolume * 100]}
                    onValueChange={([value]) => setPreferences({ soundVolume: value / 100 })}
                    max={100}
                    step={10}
                    className="flex-1"
                  />
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground w-12">
                    {Math.round(preferences.soundVolume * 100)}%
                  </span>
                </div>
                <div className="flex gap-2">
                  {(['critical', 'error', 'warning', 'info'] as SeverityLevel[]).map((severity) => (
                    <Button
                      key={severity}
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestSound(severity)}
                    >
                      Test {severity}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label className="text-base">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive browser/device notifications
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {permission === 'granted' ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    Enabled
                  </Badge>
                ) : permission === 'denied' ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                    Blocked
                  </Badge>
                ) : null}
                <Switch
                  checked={preferences.pushEnabled}
                  onCheckedChange={(checked) => setPreferences({ pushEnabled: checked })}
                  disabled={permission === 'denied'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Moon className="h-5 w-5" />
                  Quiet Hours
                </CardTitle>
                <CardDescription>
                  Silence sound alerts during specific hours
                </CardDescription>
              </div>
              <Switch
                checked={preferences.quietHoursEnabled}
                onCheckedChange={(checked) => setPreferences({ quietHoursEnabled: checked })}
              />
            </div>
          </CardHeader>
          {preferences.quietHoursEnabled && (
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label htmlFor="quiet-start" className="text-sm text-muted-foreground">
                    Start Time
                  </Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={preferences.quietHoursStart}
                    onChange={(e) => setPreferences({ quietHoursStart: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <span className="text-muted-foreground mt-6">to</span>
                <div className="flex-1">
                  <Label htmlFor="quiet-end" className="text-sm text-muted-foreground">
                    End Time
                  </Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={preferences.quietHoursEnd}
                    onChange={(e) => setPreferences({ quietHoursEnd: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              {isInQuietHours() && (
                <Badge variant="outline" className="mt-4 bg-primary/10 text-primary border-primary/30">
                  <Moon className="h-3 w-3 mr-1" />
                  Currently in quiet hours
                </Badge>
              )}
            </CardContent>
          )}
        </Card>

        {/* Severity Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Alert Severity Settings</CardTitle>
            <CardDescription>
              Configure notifications by alert importance level
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {SEVERITY_CONFIG.map(({ level, label, description, icon: Icon, color }) => (
              <div key={level} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    <Switch
                      checked={preferences.severitySettings[level].sound}
                      onCheckedChange={(checked) => updateSeveritySettings(level, { sound: checked })}
                      disabled={!preferences.soundEnabled}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Switch
                      checked={preferences.severitySettings[level].push}
                      onCheckedChange={(checked) => updateSeveritySettings(level, { push: checked })}
                      disabled={!preferences.pushEnabled || permission !== 'granted'}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Per-Alert Type Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Alert Type Overrides</CardTitle>
            <CardDescription>
              Fine-tune notifications for specific alert types (overrides severity settings)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((alertType) => {
                const Icon = ALERT_TYPE_ICONS[alertType];
                const hasOverride = preferences.alertTypeSettings[alertType] !== undefined;
                const override = preferences.alertTypeSettings[alertType];
                
                return (
                  <AccordionItem key={alertType} value={alertType}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{ALERT_TYPE_LABELS[alertType]}</span>
                        {hasOverride && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Custom
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground">
                          {ALERT_TYPE_DESCRIPTIONS[alertType]}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Use custom settings</span>
                          <Switch
                            checked={hasOverride}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                updateAlertTypeSettings(alertType, { sound: true, push: true });
                              } else {
                                updateAlertTypeSettings(alertType, undefined);
                              }
                            }}
                          />
                        </div>
                        
                        {hasOverride && (
                          <div className="flex items-center gap-6 p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <Volume2 className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-sm">Sound</Label>
                              <Switch
                                checked={override?.sound ?? false}
                                onCheckedChange={(checked) => {
                                  updateAlertTypeSettings(alertType, {
                                    sound: checked,
                                    push: override?.push ?? false
                                  });
                                }}
                                disabled={!preferences.soundEnabled}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Bell className="h-4 w-4 text-muted-foreground" />
                              <Label className="text-sm">Push</Label>
                              <Switch
                                checked={override?.push ?? false}
                                onCheckedChange={(checked) => {
                                  updateAlertTypeSettings(alertType, {
                                    sound: override?.sound ?? false,
                                    push: checked
                                  });
                                }}
                                disabled={!preferences.pushEnabled || permission !== 'granted'}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>

        {/* AI Companion Triggers */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              AI Companion Triggers
            </CardTitle>
            <CardDescription>
              Allow your vehicle to start a conversation when these events occur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: 'ignition_start' as const, label: 'Ignition Start', description: 'Vehicle starts up', icon: Power },
              { key: 'geofence_event' as const, label: 'Geofence Events', description: 'Entering or leaving geofence zones', icon: MapPin },
              { key: 'overspeeding' as const, label: 'Overspeeding', description: 'Vehicle exceeds speed limit', icon: Gauge },
              { key: 'low_battery' as const, label: 'Low Battery', description: 'Battery level drops below threshold', icon: Battery },
              { key: 'power_off' as const, label: 'Power Off', description: 'Vehicle ignition turns off', icon: Power }
            ].map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Switch
                  checked={preferences.aiChatPreferences[key]}
                  onCheckedChange={(checked) => updateAIChatPreferences(key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default NotificationSettings;
