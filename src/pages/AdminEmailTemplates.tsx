import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Save, RotateCcw } from "lucide-react";

interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  text_content: string | null;
  variables: string[];
  is_active: boolean;
}

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState<EmailTemplate | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setEditedTemplate({ ...selectedTemplate });
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_key');

      if (error) {
        toast.error(`Failed to load templates: ${error.message}`);
      } else {
        const formatted = (data || []).map(t => ({
          ...t,
          variables: Array.isArray(t.variables) ? t.variables : [],
        }));
        setTemplates(formatted);
        if (formatted.length > 0 && !selectedTemplate) {
          setSelectedTemplate(formatted[0]);
        }
      }
    } catch (err: any) {
      toast.error(`Error loading templates: ${err.message}`);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editedTemplate) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: editedTemplate.subject,
          html_content: editedTemplate.html_content,
          text_content: editedTemplate.text_content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editedTemplate.id);

      if (error) {
        toast.error(`Failed to save: ${error.message}`);
      } else {
        toast.success('Template saved successfully');
        await fetchTemplates();
      }
    } catch (err: any) {
      toast.error(`Error saving template: ${err.message}`);
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (selectedTemplate) {
      setEditedTemplate({ ...selectedTemplate });
      toast.info('Template reset to saved version');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground">
            Customize email templates sent to users for registration and vehicle assignments
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Template List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedTemplate?.id === template.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.description || template.template_key}
                      </p>
                    </div>
                    {template.is_active && (
                      <Badge variant="secondary" className="text-xs">Active</Badge>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Template Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {selectedTemplate?.name || "Select a template"}
              </CardTitle>
              <CardDescription>
                {selectedTemplate?.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editedTemplate ? (
                <>
                  {/* Available Variables */}
                  {editedTemplate.variables && editedTemplate.variables.length > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <Label className="text-xs font-semibold mb-2 block">Available Variables:</Label>
                      <div className="flex flex-wrap gap-1">
                        {editedTemplate.variables.map(v => (
                          <Badge key={v} variant="outline" className="text-xs font-mono">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Use these variables in your template. They will be replaced with actual values when sending emails.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={editedTemplate.subject}
                      onChange={(e) => setEditedTemplate({
                        ...editedTemplate,
                        subject: e.target.value
                      })}
                      placeholder="Email subject"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>HTML Content</Label>
                    <Textarea
                      value={editedTemplate.html_content}
                      onChange={(e) => setEditedTemplate({
                        ...editedTemplate,
                        html_content: e.target.value
                      })}
                      placeholder="HTML email content"
                      className="font-mono text-sm min-h-[400px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use HTML for formatting. Variables like {"{{userName}}"} will be replaced automatically.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "Saving..." : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Template
                        </>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset Changes
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Select a template to edit
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
