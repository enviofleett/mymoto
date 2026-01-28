import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, FileText } from "lucide-react";

const AVAILABLE_COMPONENTS = [
  { id: "summary", label: "AI Summary", description: "A brief, encouraging text summary of the day's driving." },
  { id: "distance", label: "Total Distance", description: "Total kilometers driven." },
  { id: "duration", label: "Total Duration", description: "Total time spent driving." },
  { id: "trip_count", label: "Trip Count", description: "Number of trips taken." },
  { id: "max_speed", label: "Max Speed", description: "Highest speed recorded." },
  { id: "map", label: "Route Map", description: "Visual map of the day's routes (static image)." },
  { id: "safety_score", label: "Safety Score", description: "Daily driving safety score (0-100)." }
];

interface ReportTemplate {
  id: string;
  name: string;
  enabled_components: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function ReportTemplateSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);

  useEffect(() => {
    fetchTemplate();
  }, []);

  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('report_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Cast data to ReportTemplate since types aren't generated yet
        const template = data as unknown as ReportTemplate;
        setTemplateId(template.id);
        // Ensure enabled_components is treated as string[]
        const components = Array.isArray(template.enabled_components) 
          ? (template.enabled_components as string[]) 
          : [];
        setSelectedComponents(components);
      } else {
        // Default selection
        setSelectedComponents(['summary', 'distance', 'duration', 'trip_count']);
      }
    } catch (error) {
      console.error("Error fetching report template:", error);
      toast.error("Failed to load report template");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (componentId: string) => {
    setSelectedComponents(prev => 
      prev.includes(componentId) 
        ? prev.filter(id => id !== componentId)
        : [...prev, componentId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: 'Default Daily Report',
        enabled_components: selectedComponents,
        is_active: true,
        updated_at: new Date().toISOString()
      };

      let error;
      if (templateId) {
        const { error: updateError } = await supabase
          .from('report_templates')
          .update(payload as any) // Type assertion needed until types are generated
          .eq('id', templateId);
        error = updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('report_templates')
          .insert([payload as any]) // Type assertion needed until types are generated
          .select()
          .single();
        
        if (data) {
           const template = data as unknown as ReportTemplate;
           setTemplateId(template.id);
        }
        error = insertError;
      }

      if (error) throw error;

      toast.success("Report template updated");
    } catch (error) {
      console.error("Error saving report template:", error);
      toast.error("Failed to save report template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Daily Report Configuration
        </CardTitle>
        <CardDescription>
          Customize what information is included in the daily trip reports sent to users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {AVAILABLE_COMPONENTS.map((component) => (
            <div key={component.id} className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <Checkbox 
                id={component.id} 
                checked={selectedComponents.includes(component.id)}
                onCheckedChange={() => handleToggle(component.id)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor={component.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {component.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {component.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
