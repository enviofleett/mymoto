import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Smartphone, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PopupConfig {
  id: string;
  title: string;
  message: string;
  button_text: string | null;
  is_enabled: boolean;
  show_for_ios: boolean;
  show_for_android: boolean;
}

export function AppPopupConfigCard() {
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [showForIos, setShowForIos] = useState(true);
  const [showForAndroid, setShowForAndroid] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_popup_config" as any)
      .select("*")
      .limit(1)
      .single();

    if (data) {
      const configData = data as unknown as PopupConfig;
      setConfig(configData);
      setTitle(configData.title);
      setMessage(configData.message);
      setButtonText(configData.button_text || "");
      setIsEnabled(configData.is_enabled);
      setShowForIos(configData.show_for_ios);
      setShowForAndroid(configData.show_for_android);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    const { error } = await supabase
      .from("app_popup_config" as any)
      .update({
        title,
        message,
        button_text: buttonText || null,
        is_enabled: isEnabled,
        show_for_ios: showForIos,
        show_for_android: showForAndroid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    setSaving(false);

    if (error) {
      toast.error("Failed to save popup settings");
      console.error(error);
    } else {
      toast.success("Popup settings saved!");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-accent" />
          PWA Welcome Popup
        </CardTitle>
        <CardDescription>
          Configure the welcome popup shown to users visiting /app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Popup</Label>
            <p className="text-xs text-muted-foreground">Show popup to visitors</p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>

        {/* Platform Toggles */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <Label className="text-sm">iOS</Label>
            <Switch checked={showForIos} onCheckedChange={setShowForIos} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <Label className="text-sm">Android</Label>
            <Switch checked={showForAndroid} onCheckedChange={setShowForAndroid} />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="popup-title">Title</Label>
          <Input
            id="popup-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Welcome to MyMoto!"
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <Label htmlFor="popup-message">Message</Label>
          <Textarea
            id="popup-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Install the app for the best experience..."
            rows={3}
          />
        </div>

        {/* Button Text */}
        <div className="space-y-2">
          <Label htmlFor="popup-button">Button Text</Label>
          <Input
            id="popup-button"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder="Got it!"
          />
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}
