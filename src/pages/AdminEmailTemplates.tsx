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
import { Mail, Save, RotateCcw, Eye, Send, Loader2, CheckCircle2, XCircle, LayoutTemplate, FileCode, Monitor, Check, WandSparkles, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { emailLayouts, EmailContentProps } from "@/lib/email-layouts";
import { cn } from "@/lib/utils";
import { buildDraftForTemplate, extractTags, validateTemplateConformance } from "@/lib/email-template-populator";
import { TemplateDraft } from "@/lib/email-template-catalog";

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

interface PopulationPreviewRow {
  id: string;
  templateKey: string;
  name: string;
  oldSubject: string;
  draft: TemplateDraft;
  allowedVariables: string[];
  presentTagCount: number;
  missingVariables: string[];
  validationErrors: string[];
  valid: boolean;
}

interface PopulationRunReport {
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ templateKey: string; reason: string }>;
}

// Validate test email (align with backend validateEmail)
function isValidTestEmail(email: string): boolean {
  const s = (email || "").trim();
  if (!s || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !/[\r\n<>]/.test(s);
}

// Sample data for template preview
const getSampleData = (templateKey: string, variables: string[] = []): Record<string, string> => {
  const baseTimestamp = new Date().toLocaleString();
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
      timestamp: baseTimestamp,
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
    },
    walletTopUp: {
      userName: "John Doe",
      amount: "₦10,000",
      newBalance: "₦32,500",
      description: "Manual credit for reconciliation",
      adminName: "Fleet Admin",
      walletLink: "https://app.example.com/owner/wallet"
    },
    newUserBonusNotification: {
      userName: "John Doe",
      bonusAmount: "₦2,000",
      walletLink: "https://app.example.com/owner/wallet"
    },
    vehicle_request_approved: {
      userName: "John Doe",
      deviceId: "358657105966092",
      plateNumber: "ABC-123XY",
      actionLink: "https://app.example.com/owner/vehicles"
    },
    vehicle_request_rejected: {
      userName: "John Doe",
      plateNumber: "ABC-123XY",
      adminNotes: "Please verify your ownership documents and resubmit."
    }
  };
  if (samples[templateKey]) {
    return samples[templateKey];
  }

  const genericSamples: Record<string, string> = {
    userName: "John Doe",
    title: "Account Update",
    message: "This is a sample message from MyMoto.",
    actionLink: "https://app.example.com/notifications",
    actionText: "View Details",
    timestamp: baseTimestamp,
  };

  for (const variable of variables) {
    if (genericSamples[variable]) continue;
    genericSamples[variable] = `Sample ${variable.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`;
  }

  return genericSamples;
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

  // Minimal wrapper - just the content
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      ${content}
    </div>
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
  const [populateDialogOpen, setPopulateDialogOpen] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [populationPreviewRows, setPopulationPreviewRows] = useState<PopulationPreviewRow[]>([]);
  const [populationReport, setPopulationReport] = useState<PopulationRunReport | null>(null);

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
    
    const sampleData = getSampleData(editedTemplate.template_key, editedTemplate.variables);
    const processedSubject = replaceTemplateVariables(editedTemplate.subject, sampleData);
    const processedContent = replaceTemplateVariables(editedTemplate.html_content, sampleData);
    const wrappedHtml = wrapInEmailTemplate(processedContent);
    
    setPreviewHtml(wrappedHtml);
  };

  const normalizeTemplates = (data: any[]): EmailTemplate[] =>
    (data || []).map(t => ({
      ...t,
      variables: Array.isArray(t.variables) ? t.variables : [],
      design_metadata: typeof t.design_metadata === 'string'
        ? JSON.parse(t.design_metadata)
        : t.design_metadata || null
    }));

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
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
        const formatted = normalizeTemplates(data || []);
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

  const fetchLatestTemplatesForPopulation = async (): Promise<EmailTemplate[] | null> => {
    try {
      const { data, error } = await (supabase as any)
        .from('email_templates')
        .select('*')
        .order('template_key');

      if (error) {
        toast.error(`Failed to fetch latest templates: ${error.message}`);
        return null;
      }
      const normalized = normalizeTemplates(data || []);
      setTemplates(normalized);
      return normalized;
    } catch (err: any) {
      console.error(err);
      toast.error(`Error fetching latest templates: ${err.message}`);
      return null;
    }
  };

  const preparePopulationPreview = async () => {
    const latestTemplates = await fetchLatestTemplatesForPopulation();
    if (!latestTemplates) return;

    const rows: PopulationPreviewRow[] = latestTemplates.map((template) => {
      const allowedVariables = Array.isArray(template.variables) ? template.variables : [];
      const draft = buildDraftForTemplate({
        template_key: template.template_key,
        subject: template.subject,
        html_content: template.html_content,
        text_content: template.text_content,
        variables: allowedVariables,
      });

      const validation = validateTemplateConformance(draft, allowedVariables);
      const presentTags = new Set<string>([
        ...extractTags(draft.subject),
        ...extractTags(draft.html_content),
      ]);
      const missingVariables = allowedVariables.filter((variable) => !presentTags.has(variable));

      return {
        id: template.id,
        templateKey: template.template_key,
        name: template.name,
        oldSubject: template.subject,
        draft,
        allowedVariables,
        presentTagCount: allowedVariables.length - missingVariables.length,
        missingVariables,
        validationErrors: validation.errors,
        valid: validation.ok,
      };
    });

    setPopulationPreviewRows(rows);
    setPopulationReport(null);
    setPopulateDialogOpen(true);
  };

  const applyPopulation = async () => {
    if (populationPreviewRows.length === 0) return;

    setPopulating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();

      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: Array<{ templateKey: string; reason: string }> = [];

      for (const row of populationPreviewRows) {
        if (!row.valid) {
          skipped += 1;
          errors.push({
            templateKey: row.templateKey,
            reason: row.validationErrors.join("; "),
          });
          continue;
        }

        const { error } = await (supabase as any)
          .from("email_templates")
          .update({
            subject: row.draft.subject,
            html_content: row.draft.html_content,
            text_content: row.draft.text_content ?? null,
            updated_at: now,
            updated_by: user?.id || null,
          })
          .eq("id", row.id);

        if (error) {
          failed += 1;
          errors.push({
            templateKey: row.templateKey,
            reason: error.message,
          });
        } else {
          updated += 1;
        }
      }

      const report: PopulationRunReport = { updated, skipped, failed, errors };
      setPopulationReport(report);
      await fetchTemplates();

      if (failed === 0 && skipped === 0) {
        toast.success(`Professional copy applied to ${updated} template(s).`);
      } else {
        toast.warning(`Population complete: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
      }
    } catch (err: any) {
      toast.error(`Population failed: ${err.message || "Unknown error"}`);
    } finally {
      setPopulating(false);
    }
  };

  const validateSenderIdInput = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Sender must not be empty when provided";
    }
    const angleMatch = trimmed.match(/^(.*)<([^>]+)>\s*$/);
    let email = trimmed;
    if (angleMatch) {
      email = angleMatch[2].trim();
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Sender must be an email like "name@example.com" or "Name <name@example.com>"';
    }
    return null;
  };

  const handleSave = async () => {
    if (!editedTemplate) return;

    if (editedTemplate.sender_id) {
      const senderError = validateSenderIdInput(editedTemplate.sender_id);
      if (senderError) {
        toast.error(senderError);
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await (supabase as any)
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

    if (editedTemplate.sender_id) {
      const senderError = validateSenderIdInput(editedTemplate.sender_id);
      if (senderError) {
        toast.error(senderError);
        return;
      }
    }

    setSendingTest(true);
    try {
      const parseFunctionError = async (input: unknown): Promise<string> => {
        const fallback = input instanceof Error ? input.message : "Failed to send email";
        const candidate = input as {
          message?: string;
          context?: { json?: () => Promise<unknown>; text?: () => Promise<string>; status?: number };
        };
        let msg = candidate?.message || fallback;
        try {
          const ctx = candidate?.context;
          if (ctx?.json) {
            const payload = await ctx.json() as { error?: string; message?: string; code?: string };
            msg = payload?.error || payload?.message || payload?.code || msg;
          } else if (ctx?.text) {
            const text = await ctx.text();
            if (text) msg = text;
          }
        } catch {
          // ignore parse failures
        }
        return msg;
      };

      const { data: { session } } = await supabase.auth.refreshSession();
      const currentSession = session ?? (await supabase.auth.getSession()).data?.session;
      
      if (!currentSession?.access_token) {
        toast.error("Authentication required. Please sign in again.");
        setSendingTest(false);
        return;
      }

      const sampleData = getSampleData(editedTemplate.template_key, editedTemplate.variables);
      const processedSubject = replaceTemplateVariables(editedTemplate.subject, sampleData);
      const processedHtml = replaceTemplateVariables(editedTemplate.html_content, sampleData);
      // Logic change: If using builder (Full HTML), don't wrap. If code mode and partial, wrap.
      // But wrapInEmailTemplate handles this check now!
      const finalHtml = wrapInEmailTemplate(processedHtml);

      const testData: Record<string, string | undefined> = {
        ...sampleData,
        ...(editedTemplate.sender_id && { senderId: editedTemplate.sender_id }),
      };

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          template: editedTemplate.template_key as any,
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
        const detailedMessage = await parseFunctionError(error);
        throw new Error(detailedMessage);
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
      const errorMessage =
        err?.message ||
        (typeof err === "string" ? err : "Unknown error");
      toast.error(`Failed to send test email: ${errorMessage}`);
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
      <div className="space-y-6 pb-32">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
            <p className="text-muted-foreground">
              Customize email templates sent to users for registration, alerts, and notifications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={preparePopulationPreview} className="gap-2">
              <WandSparkles className="h-4 w-4" />
              Populate Professional Copy
            </Button>
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
                              {JSON.stringify(getSampleData(editedTemplate.template_key, editedTemplate.variables), null, 2)}
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

                    <div className="space-y-2">
                      <Label>Sender ID (optional)</Label>
                      <Input
                        value={editedTemplate.sender_id || ""}
                        onChange={(e) => setEditedTemplate({
                          ...editedTemplate,
                          sender_id: e.target.value || null
                        })}
                        placeholder='MyMoto Fleet <no-reply@mymoto.com>'
                      />
                      <p className="text-xs text-muted-foreground">
                        Use "Name &lt;email@domain.com&gt;" or "email@domain.com". If empty, the default sender name is used.
                      </p>
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
                       <div className="border rounded-lg shadow-sm flex-1 overflow-auto bg-white p-4">
                        <div
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                          className="w-full h-full"
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
      <Dialog open={populateDialogOpen} onOpenChange={setPopulateDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Populate Professional Copy</DialogTitle>
            <DialogDescription>
              Review generated copy for all templates before applying updates.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto border rounded-lg">
            <div className="grid grid-cols-[1.2fr_2fr_1.2fr_1.4fr] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/40">
              <span>Template</span>
              <span>Subject Change</span>
              <span>Tag Coverage</span>
              <span>Conformance</span>
            </div>
            {populationPreviewRows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1.2fr_2fr_1.2fr_1.4fr] gap-3 px-4 py-3 border-b last:border-b-0 text-sm"
              >
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.templateKey}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground line-through">{row.oldSubject}</p>
                  <p className="font-medium">{row.draft.subject}</p>
                </div>
                <div>
                  <p className={row.missingVariables.length === 0 ? "text-green-600" : "text-amber-600"}>
                    {row.presentTagCount}/{row.allowedVariables.length || 0} covered
                  </p>
                  {row.missingVariables.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Missing: {row.missingVariables.map(v => `{{${v}}}`).join(", ")}
                    </p>
                  )}
                </div>
                <div>
                  {row.valid ? (
                    <p className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Pass
                    </p>
                  ) : (
                    <div className="text-amber-600 space-y-1">
                      <p className="flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Skip
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.validationErrors.join("; ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {populationReport && (
            <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
              <p className="font-medium">Run Summary</p>
              <p>Updated: {populationReport.updated}</p>
              <p>Skipped: {populationReport.skipped}</p>
              <p>Failed: {populationReport.failed}</p>
              {populationReport.errors.length > 0 && (
                <div className="text-xs text-muted-foreground max-h-24 overflow-auto">
                  {populationReport.errors.map((err, index) => (
                    <p key={`${err.templateKey}-${index}`}>{err.templateKey}: {err.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPopulateDialogOpen(false)}
              disabled={populating}
            >
              Close
            </Button>
            <Button
              onClick={applyPopulation}
              disabled={populating || populationPreviewRows.length === 0}
            >
              {populating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <WandSparkles className="h-4 w-4 mr-2" />
                  Confirm and Apply
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
