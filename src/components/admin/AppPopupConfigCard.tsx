import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, MessageSquare, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PopupConfig {
  id: string;
  is_enabled: boolean;
  title: string;
  message: string;
  button_text: string;
  show_for_ios: boolean;
  show_for_android: boolean;
}

const AppPopupConfigCard = () => {
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("app_popup_config")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("Failed to load popup config:", error);
      toast.error("Failed to load popup configuration");
    } else if (data) {
      setConfig(data as PopupConfig);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    const { error } = await (supabase as any)
      .from("app_popup_config")
      .update({
        is_enabled: config.is_enabled,
        title: config.title,
        message: config.message,
        button_text: config.button_text,
        show_for_ios: config.show_for_ios,
        show_for_android: config.show_for_android,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    setIsSaving(false);

    if (error) {
      console.error("Failed to save popup config:", error);
      toast.error("Failed to save changes");
    } else {
      toast.success("Popup configuration saved!");
    }
  };

  const handleResetDismissals = () => {
    // Clear all popup dismissal flags from localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("popup_dismissed_")) {
        localStorage.removeItem(key);
      }
    });
    toast.success("All popup dismissals cleared! Users will see the popup again.");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No popup configuration found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>App Install Popup</CardTitle>
            <CardDescription>
              Configure the welcome popup shown on the /app install page
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
          <div className="space-y-0.5">
            <Label htmlFor="popup-enabled">Popup Enabled</Label>
            <p className="text-sm text-muted-foreground">
              Show the welcome popup to visitors
            </p>
          </div>
          <Switch
            id="popup-enabled"
            checked={config.is_enabled}
            onCheckedChange={(checked) =>
              setConfig({ ...config, is_enabled: checked })
            }
          />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="popup-title">Title</Label>
          <Input
            id="popup-title"
            value={config.title}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
            placeholder="Welcome to MyMoto!"
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <Label htmlFor="popup-message">Message</Label>
          <Textarea
            id="popup-message"
            value={config.message}
            onChange={(e) => setConfig({ ...config, message: e.target.value })}
            placeholder="Tell users about your app..."
            rows={3}
          />
        </div>

        {/* Button Text */}
        <div className="space-y-2">
          <Label htmlFor="popup-button">Button Text</Label>
          <Input
            id="popup-button"
            value={config.button_text}
            onChange={(e) =>
              setConfig({ ...config, button_text: e.target.value })
            }
            placeholder="Got it!"
          />
        </div>

        {/* Device Targeting */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Device Targeting
          </Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <Label htmlFor="show-ios" className="text-sm">
                iOS
              </Label>
              <Switch
                id="show-ios"
                checked={config.show_for_ios}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, show_for_ios: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <Label htmlFor="show-android" className="text-sm">
                Android
              </Label>
              <Switch
                id="show-android"
                checked={config.show_for_android}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, show_for_android: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleResetDismissals}
            className="flex-1"
          >
            Reset Dismissals
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AppPopupConfigCard;