
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Sparkles, MessageSquarePlus } from "lucide-react";

const DEFAULT_WELCOME_TEMPLATE = `Welcome to your new {{vehicle_name}}! 🚗
I am your AI companion, connected directly to this vehicle's systems.
I can help you track trips, monitor health, and ensure security.
Feel free to ask me anything about your car!`;

export function WelcomeMessageSettings() {
  const [template, setTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTemplate();
  }, []);

  const fetchTemplate = async () => {
    setIsLoading(true);
    try {
      // @ts-ignore
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "welcome_message_template")
        .maybeSingle();

      if (error) throw error;

      setTemplate(data?.value || DEFAULT_WELCOME_TEMPLATE);
    } catch (error) {
      console.error("Error fetching welcome template:", error);
      toast.error("Failed to load welcome template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sb: any = supabase;
      const { error } = await sb
        .from("app_settings")
        .upsert({
          key: "welcome_message_template",
          value: template,
          metadata: {
            description: "Template for new vehicle welcome messages",
            updated_by: "admin",
            last_updated: new Date().toISOString()
          }
        }, { onConflict: "key" });

      if (error) throw error;

      toast.success("Welcome template updated");
    } catch (error) {
      console.error("Error saving welcome template:", error);
      toast.error("Failed to save welcome template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
          <CardTitle>New Vehicle Welcome Message</CardTitle>
        </div>
        <CardDescription>
          Configure the message sent by the AI when a new vehicle is added.
          The AI will combine this template with the vehicle's actual status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Message Template</label>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Enter welcome message template..."
            className="min-h-[150px] font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Available placeholders: <code>{"{{vehicle_name}}"}</code>, <code>{"{{owner_name}}"}</code>
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Template
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
