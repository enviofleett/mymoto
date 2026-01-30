import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Save, RotateCcw, Eye, Send, Loader2, CheckCircle2, XCircle, LayoutTemplate, FileCode, Monitor, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { emailLayouts, EmailContentProps } from "@/lib/email-layouts";
import { cn } from "@/lib/utils";

interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  text_content: string | null;
  variables: string[];
  sender_id: string | null;
  is_active: boolean;
  design_metadata: {
    layoutId?: string;
    content?: EmailContentProps;
  } | null;
}

// Validate test email (align with backend validateEmail)
function isValidTestEmail(email: string): boolean {
  const s = (email || "").trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !/[\r\n<>]/.test(s);
}

// Sample data for template preview
const getSampleData = (templateKey: string): Record<string, string> => {
  const samples: Record<string, Record<string, string>> = {
    welcome: {
      userName: "John Doe",
      vehicleCount: "2",
      loginLink: "https://app.example.com/auth"
    },
    vehicle_assignment: {
      userName: "John Doe",
      vehicleCount: "3",
      actionLink: "https://app.example.com/fleet"
    },
    alert: {
      severity: "warning",
      title: "Low Battery Alert",
      message: "Your vehicle battery is below 20%",
      vehicleName: "Toyota Camry",
      timestamp: new Date().toLocaleString(),
      severityColor: "#f59e0b",
      severityIcon: "⚠️"
    },
    passwordReset: {
      userName: "John Doe",
      resetLink: "https://app.example.com/reset-password?token=abc123",
      expiresIn: "1 hour"
    },
    tripSummary: {
      userName: "John Doe",
      vehicleName: "Toyota Camry",
      date: new Date().toLocaleDateString(),
      distance: "45.2 km",
      duration: "1h 23m",
      startLocation: "123 Main St, City",
      endLocation: "456 Oak Ave, City",
      maxSpeed: "85 km/h",
      avgSpeed: "38 km/h"
    },
    systemNotification: {
      title: "System Maintenance",
      message: "We will be performing scheduled maintenance on March 15th from 2 AM to 4 AM.",
      actionLink: "https://app.example.com/notifications",
      actionText: "View Details"
    }
  };
  return samples[templateKey] || {};
};

// Escape HTML to prevent XSS
function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, m => map[m]);
}

// Simple template variable replacement with HTML escaping
function replaceTemplateVariables(template: string, data: Record<string, string>): string {
  let result = template;
  
  // Replace {{variable}} with escaped values to prevent XSS
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    // Escape HTML in template variables for security
    result = result.replace(regex, escapeHtml(String(value || '')));
  }
  
  // Simple conditional handling - remove {{#if}} blocks if variable is empty
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
    return data[variable] ? content : '';
  });
  
  // Remove any remaining template syntax
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}

// Wrap HTML content in base email template
function wrapInEmailTemplate(content: string): string {
  // If content is already a full HTML document, return it as is
  if (content.trim().toLowerCase().startsWith('<!doctype html') || content.trim().toLowerCase().startsWith('<html')) {
    return content;
  }

  // Otherwise wrap in default legacy template (Clean Bright style)
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet Management</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <h1 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">MyMoto Fleet</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 13px;">
                MyMoto Fleet Management System
              </p>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 12px;">
                Automated notification • Do not reply
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export default function AdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState<EmailTemplate | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [editMode, setEditMode] = useState<'builder' | 'code'>('builder');

  // Builder state
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(emailLayouts[0].id);
  const [builderContent, setBuilderContent] = useState<EmailContentProps>({
    headline: '',
    body: '',
    callToAction: { text: '', url: '' },
    footerText: ''
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setEditedTemplate({ ...selectedTemplate });
      
      // Initialize builder state from metadata or try to parse
      if (selectedTemplate.design_metadata?.content) {
        setBuilderContent(selectedTemplate.design_metadata.content);
        setSelectedLayoutId(selectedTemplate.design_metadata.layoutId || emailLayouts[0].id);
        setEditMode('builder');
      } else {
        // Fallback: If no metadata, default to builder but empty, or code mode?
        // Let's default to builder with empty fields to encourage using it, 
        // unless it's a complex existing template.
        setEditMode('builder');
        // Try to preserve existing body if switching to builder
        setBuilderContent({
          headline: selectedTemplate.subject,
          body: selectedTemplate.html_content, // This might be raw HTML, which is fine
          callToAction: { text: '', url: '' },
          footerText: ''
        });
      }
      
      updatePreview();
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (editedTemplate) {
      updatePreview();
    }
  }, [editedTemplate?.subject, editedTemplate?.html_content]);

  // Update HTML when builder content changes
  useEffect(() => {
    if (editMode === 'builder' && editedTemplate) {
      const layout = emailLayouts.find(l => l.id === selectedLayoutId) || emailLayouts[0];
      const generatedHtml = layout.generateHtml(builderContent);
      
      setEditedTemplate(prev => prev ? ({
        ...prev,
        html_content: generatedHtml,
        design_metadata: {
          layoutId: selectedLayoutId,
          content: builderContent
        }
      }) : null);
    }
  }, [builderContent, selectedLayoutId, editMode]);

  const updatePreview = () => {
    if (!editedTemplate) return;
    
    const sampleData = getSampleData(editedTemplate.template_key);
    const processedSubject = replaceTemplateVariables(editedTemplate.subject, sampleData);
    const processedContent = replaceTemplateVariables(editedTemplate.html_content, sampleData);
    const wrappedHtml = wrapInEmailTemplate(processedContent);
    
    setPreviewHtml(wrappedHtml);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_key');

      if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('schema cache') || error.message?.includes('not found')) {
          setTableMissing(true);
          toast.error(
            'Email templates table not found. Please run the migration SQL file.',
            { duration: 10000 }
          );
        } else {
          toast.error(`Failed to load templates: ${error.message}`);
        }
      } else {
        setTableMissing(false);
        const formatted = (data || []).map(t => ({
          ...t,
          variables: Array.isArray(t.variables) ? t.variables : [],
          // Ensure design_metadata is typed correctly
          design_metadata: typeof t.design_metadata === 'string' 
            ? JSON.parse(t.design_metadata) 
            : t.design_metadata || null
        }));
        setTemplates(formatted);
        if (formatted.length > 0 && !selectedTemplate) {
          setSelectedTemplate(formatted[0]);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Error loading templates: ${err.message}`);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editedTemplate) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: editedTemplate.subject,
          html_content: editedTemplate.html_content,
          text_content: editedTemplate.text_content,
          sender_id: editedTemplate.sender_id || null,
          is_active: editedTemplate.is_active,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
          design_metadata: editedTemplate.design_metadata || null // Save metadata
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
      if (selectedTemplate.design_metadata?.content) {
        setBuilderContent(selectedTemplate.design_metadata.content);
        setSelectedLayoutId(selectedTemplate.design_metadata.layoutId || emailLayouts[0].id);
        setEditMode('builder');
      }
      toast.info('Template reset to saved version');
    }
  };

  const handleSendTestEmail = async () => {
    const trimmedEmail = (testEmailAddress || "").trim();
    if (!editedTemplate || !trimmedEmail) {
      toast.error("Please enter a test email address");
      return;
    }

    if (!isValidTestEmail(trimmedEmail)) {
      toast.error("Please enter a valid email address (e.g. name@example.com)");
      return;
    }

    setSendingTest(true);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const currentSession = session ?? (await supabase.auth.getSession()).data?.session;
      
      if (!currentSession?.access_token) {
        toast.error("Authentication required. Please sign in again.");
        setSendingTest(false);
        return;
      }

      const sampleData = getSampleData(editedTemplate.template_key);
      const processedSubject = replaceTemplateVariables(editedTemplate.subject, sampleData);
      const processedHtml = replaceTemplateVariables(editedTemplate.html_content, sampleData);
      // Logic change: If using builder (Full HTML), don't wrap. If code mode and partial, wrap.
      // But wrapInEmailTemplate handles this check now!
      const finalHtml = wrapInEmailTemplate(processedHtml);

      const isVehicleAssignment = editedTemplate.template_key === 'vehicle_assignment';
      const templateForInvoke = isVehicleAssignment ? 'systemNotification' : editedTemplate.template_key;
      const testData: Record<string, string | undefined> = isVehicleAssignment
        ? {
            title: "New Vehicle(s) Assigned",
            message: `Hello ${sampleData.userName ?? 'User'}, ${sampleData.vehicleCount ?? '1'} vehicle(s) have been assigned to your account. You can view them in your dashboard.`,
            actionLink: sampleData.actionLink ?? "https://app.example.com/fleet",
            actionText: "View Vehicles",
            ...(editedTemplate.sender_id && { senderId: editedTemplate.sender_id }),
          }
        : {
            ...sampleData,
            ...(editedTemplate.sender_id && { senderId: editedTemplate.sender_id }),
          };

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          template: templateForInvoke,
          to: trimmedEmail,
          data: testData,
          customSubject: processedSubject,
          customHtml: finalHtml,
          bypassStatusCheck: true,
        },
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        console.error('Test email error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error || data.message || 'Failed to send email');
      }
      
      if (data?.success !== false) {
        toast.success(`Test email sent to ${trimmedEmail}`);
        setTestEmailDialogOpen(false);
        setTestEmailAddress("");
      } else {
        throw new Error(data?.error || data?.message || 'Failed to send email');
      }
    } catch (err: any) {
      console.error('Test email exception:', err);
      toast.error(`Failed to send test email: ${err.message || 'Unknown error'}`);
    }
    setSendingTest(false);
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

  if (tableMissing) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Card>
             <CardHeader>
               <CardTitle>Setup Required</CardTitle>
               <CardDescription>Please run migration.</CardDescription>
             </CardHeader>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
            <p className="text-muted-foreground">
              Customize email templates sent to users for registration, alerts, and notifications
            </p>
          </div>
          {editedTemplate && (
            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
               <Button 
                 variant={editMode === 'builder' ? 'default' : 'ghost'} 
                 size="sm" 
                 onClick={() => setEditMode('builder')}
                 className="gap-2"
               >
                 <LayoutTemplate className="h-4 w-4" />
                 Visual Builder
               </Button>
               <Button 
                 variant={editMode === 'code' ? 'default' : 'ghost'} 
                 size="sm" 
                 onClick={() => setEditMode('code')}
                 className="gap-2"
               >
                 <FileCode className="h-4 w-4" />
                 Code Editor
               </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-sm">Templates</CardTitle>
              <CardDescription className="text-xs">
                {templates.length} template{templates.length !== 1 ? 's' : ''} available
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors border",
                    selectedTemplate?.id === template.id
                      ? "bg-primary/5 border-primary/30"
                      : "hover:bg-muted/50 border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description || template.template_key}
                      </p>
                    </div>
                    {template.is_active && (
                      <Badge variant="secondary" className="text-[10px] ml-2 h-5">Active</Badge>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Template Editor & Preview */}
          <Card className="lg:col-span-2 flex flex-col min-h-[600px]">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    {selectedTemplate?.name || "Select a template"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {selectedTemplate?.description}
                  </CardDescription>
                </div>
                {editedTemplate && (
                  <div className="flex items-center gap-2">
                    <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Send className="h-4 w-4 mr-2" />
                          Send Test
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send Test Email</DialogTitle>
                          <DialogDescription>
                            Send a test email with sample data to verify your template looks correct.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Test Email Address</Label>
                            <Input
                              type="email"
                              placeholder="test@example.com"
                              value={testEmailAddress}
                              onChange={(e) => setTestEmailAddress(e.target.value)}
                            />
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-sm font-medium mb-1">Preview Data:</p>
                            <pre className="text-xs text-muted-foreground overflow-auto max-h-40">
                              {JSON.stringify(getSampleData(editedTemplate.template_key), null, 2)}
                            </pre>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setTestEmailDialogOpen(false)}
                            disabled={sendingTest}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSendTestEmail}
                            disabled={sendingTest || !(testEmailAddress || "").trim() || !isValidTestEmail(testEmailAddress)}
                          >
                            {sendingTest ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send Test Email
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button onClick={handleSave} disabled={saving} size="sm">
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {editedTemplate ? (
                <Tabs defaultValue="edit" className="flex-1 flex flex-col">
                  <div className="px-6 py-2 border-b bg-muted/30">
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                      <TabsTrigger value="edit">Edit Content</TabsTrigger>
                      <TabsTrigger value="preview">Live Preview</TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <TabsContent value="edit" className="flex-1 p-6 space-y-6 m-0">
                    {/* Active Status */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Active Status</Label>
                        <p className="text-sm text-muted-foreground">
                          {editedTemplate.is_active ? "Enabled" : "Disabled"}
                        </p>
                      </div>
                      <Switch 
                        checked={editedTemplate.is_active}
                        onCheckedChange={(checked) => setEditedTemplate({
                          ...editedTemplate,
                          is_active: checked
                        })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Subject Line</Label>
                      <Input
                        value={editedTemplate.subject}
                        onChange={(e) => setEditedTemplate({
                          ...editedTemplate,
                          subject: e.target.value
                        })}
                        placeholder="Email subject"
                      />
                    </div>

                    {editMode === 'builder' ? (
                      <div className="space-y-6">
                        {/* Layout Selector */}
                        <div className="space-y-3">
                           <Label>Choose Layout</Label>
                           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             {emailLayouts.map(layout => (
                               <div 
                                 key={layout.id}
                                 className={cn(
                                   "cursor-pointer rounded-lg border-2 p-3 transition-all hover:border-primary/50",
                                   selectedLayoutId === layout.id ? "border-primary bg-primary/5" : "border-muted"
                                 )}
                                 onClick={() => setSelectedLayoutId(layout.id)}
                               >
                                 <div className={cn("h-24 w-full rounded mb-2", layout.thumbnail)}></div>
                                 <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{layout.name}</span>
                                    {selectedLayoutId === layout.id && <Check className="h-4 w-4 text-primary" />}
                                 </div>
                                 <p className="text-xs text-muted-foreground mt-1">{layout.description}</p>
                               </div>
                             ))}
                           </div>
                        </div>

                        {/* Content Fields */}
                        <div className="space-y-4 border-t pt-4">
                           <h3 className="text-sm font-semibold">Email Literature</h3>
                           
                           <div className="space-y-2">
                             <Label>Headline / Greeting</Label>
                             <Input 
                               value={builderContent.headline || ''}
                               onChange={e => setBuilderContent({...builderContent, headline: e.target.value})}
                               placeholder="e.g. Welcome to MyMoto Fleet!"
                             />
                           </div>

                           <div className="space-y-2">
                             <Label>Body Content</Label>
                             <Textarea 
                               value={builderContent.body}
                               onChange={e => setBuilderContent({...builderContent, body: e.target.value})}
                               placeholder="Write your message here..."
                               className="min-h-[200px]"
                             />
                             <div className="text-xs text-muted-foreground">
                               <p>Available variables: {editedTemplate.variables.map(v => `{{${v}}}`).join(', ')}</p>
                             </div>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                               <Label>Button Text (Optional)</Label>
                               <Input 
                                 value={builderContent.callToAction?.text || ''}
                                 onChange={e => setBuilderContent({
                                   ...builderContent, 
                                   callToAction: { ...builderContent.callToAction, text: e.target.value } as any
                                 })}
                                 placeholder="e.g. Get Started"
                               />
                             </div>
                             <div className="space-y-2">
                               <Label>Button URL (Optional)</Label>
                               <Input 
                                 value={builderContent.callToAction?.url || ''}
                                 onChange={e => setBuilderContent({
                                   ...builderContent, 
                                   callToAction: { ...builderContent.callToAction, url: e.target.value } as any
                                 })}
                                 placeholder="e.g. {{loginLink}}"
                               />
                             </div>
                           </div>

                           <div className="space-y-2">
                             <Label>Footer Text</Label>
                             <Input 
                               value={builderContent.footerText || ''}
                               onChange={e => setBuilderContent({...builderContent, footerText: e.target.value})}
                               placeholder="e.g. MyMoto Fleet Management System"
                             />
                           </div>
                        </div>
                      </div>
                    ) : (
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
                          Directly editing HTML. Switch to "Visual Builder" for easier editing.
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="preview" className="flex-1 bg-muted/10 m-0 p-0 flex flex-col">
                    <div className="flex-1 bg-white p-4 overflow-hidden flex flex-col">
                       <div className="border rounded-lg shadow-sm flex-1 overflow-hidden">
                        <iframe
                          srcDoc={previewHtml}
                          className="w-full h-full border-0"
                          title="Email Preview"
                        />
                       </div>
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12">
                  <Mail className="h-12 w-12 mb-4 opacity-20" />
                  <p>Select a template from the list to start editing</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
