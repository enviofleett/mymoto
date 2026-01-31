import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Save, Loader2 } from "lucide-react";

const AVAILABLE_COMPONENTS = [
  { id: "summary", label: "AI Summary" },
  { id: "distance", label: "Total Distance" },
  { id: "duration", label: "Total Duration" },
  { id: "trip_count", label: "Trip Count" },
  { id: "max_speed", label: "Max Speed" },
  { id: "safety_score", label: "Safety Score" },
  { id: "map", label: "Route Map" },
];

export default function AdminReportTemplates() {
  const [template, setTemplate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTemplate();
  }, []);

  const fetchTemplate = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("report_templates")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setTemplate(data);
      } else {
        // Create default if none exists
        const defaultTemplate = {
            name: "Default Template",
            subject_template: "Daily Trip Report for {{date}}",
            enabled_components: ["summary", "distance", "trip_count"],
            is_active: true
        }
        setTemplate(defaultTemplate)
      }
    } catch (error) {
      console.error("Error fetching template:", error);
      toast.error("Failed to load report template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("report_templates")
        .upsert({
          ...template,
          updated_at: new Date().toISOString()
        }, { onConflict: "name" });

      if (error) throw error;

      toast.success("Template saved successfully");
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleComponent = (id: string) => {
    if (!template) return;
    const current = template.enabled_components || [];
    const updated = current.includes(id)
      ? current.filter((c: string) => c !== id)
      : [...current, id];
    
    setTemplate({ ...template, enabled_components: updated });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Templates</h1>
          <p className="text-muted-foreground">
            Configure the content and layout of daily trip reports.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Daily Report Configuration
            </CardTitle>
            <CardDescription>
              Customize what information is included in the daily email reports sent to users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="subject">Email Subject Template</Label>
              <Input
                id="subject"
                value={template?.subject_template || ""}
                onChange={(e) => setTemplate({ ...template, subject_template: e.target.value })}
                placeholder="Daily Trip Report for {{date}}"
              />
              <p className="text-xs text-muted-foreground">
                Available variables: {"{{date}}"}, {"{{vehicle_count}}"}
              </p>
            </div>

            <div className="space-y-4">
              <Label>Included Components</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AVAILABLE_COMPONENTS.map((comp) => (
                  <div key={comp.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={comp.id}
                      checked={template?.enabled_components?.includes(comp.id)}
                      onCheckedChange={() => toggleComponent(comp.id)}
                    />
                    <Label htmlFor={comp.id}>{comp.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
