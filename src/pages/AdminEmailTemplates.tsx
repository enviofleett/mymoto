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
import { Mail, Save, RotateCcw, Eye, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet Management</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #3b82f6; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">MyMoto Fleet</h1>
              <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">Fleet Management System</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                MyMoto Fleet Management System
              </p>
              <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 11px;">
                This is an automated notification. Do not reply to this email.
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

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setEditedTemplate({ ...selectedTemplate });
      updatePreview();
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (editedTemplate) {
      updatePreview();
    }
  }, [editedTemplate?.subject, editedTemplate?.html_content]);

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
        }));
        setTemplates(formatted);
        if (formatted.length > 0 && !selectedTemplate) {
          setSelectedTemplate(formatted[0]);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('schema cache') || err.message?.includes('not found')) {
        setTableMissing(true);
        toast.error(
          'Email templates table not found. Please run the migration SQL file.',
          { duration: 10000 }
        );
      } else {
        toast.error(`Error loading templates: ${err.message}`);
      }
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
      // ✅ FIX: Always refresh session before invoke (gateway verify_jwt can reset to true on deploy)
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
      const wrappedHtml = wrapInEmailTemplate(processedHtml);

      // ✅ FIX: vehicle_assignment maps to systemNotification; backend requires title, message, actionLink, actionText
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

      // ✅ FIX: Pass Authorization explicitly (gateway verify_jwt may be true; use fresh token)
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          template: templateForInvoke,
          to: trimmedEmail,
          data: testData,
          customSubject: processedSubject,
          customHtml: wrappedHtml,
          bypassStatusCheck: true, // Always allow test emails
        },
        headers: {
          Authorization: `Bearer ${currentSession.access_token}`,
        },
      });

      if (error) {
        console.error('Test email error:', error);
        
        // Check for specific error types
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          throw new Error('Authentication failed. Please sign in again as an admin and try again.');
        }
        
        if (error.message?.includes('CORS') || error.message?.includes('preflight')) {
          throw new Error('CORS error: The email function may not be deployed or configured correctly. Please check your Supabase Edge Functions.');
        }
        
        if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
          throw new Error('Access denied: Admin access is required to send test emails. Please check that your user has the admin role.');
        }
        
        // 429 rate limit – use resetAt from response body when available
        const isRateLimit = error.message?.includes('429') || /rate limit/i.test(error.message ?? '');
        if (isRateLimit && data?.resetAt) {
          const resetAt = new Date(data.resetAt);
          const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
          throw new Error(`Rate limit exceeded. Try again in ${secs} second${secs !== 1 ? 's' : ''}.`);
        }
        if (isRateLimit) {
          throw new Error('Rate limit exceeded. Please wait a minute before sending another test email.');
        }
        
        throw error;
      }

      if (data?.error) {
        // 429 may also come as data.error (e.g. when status not propagated)
        const isRateLimit = data?.resetAt != null || (typeof data?.error === 'string' && /rate limit|429/i.test(data.error));
        if (isRateLimit && data?.resetAt) {
          const resetAt = new Date(data.resetAt);
          const secs = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
          throw new Error(`Rate limit exceeded. Try again in ${secs} second${secs !== 1 ? 's' : ''}.`);
        }
        if (isRateLimit) {
          throw new Error('Rate limit exceeded. Please wait a minute before sending another test email.');
        }
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
      const errorMessage = err.message || err.error || 'Unknown error';
      
      if (errorMessage.includes('CORS') || errorMessage.includes('preflight')) {
        toast.error('CORS Error: Please ensure the send-email Edge Function is deployed and accessible.');
      } else {
        toast.error(`Failed to send test email: ${errorMessage}`);
      }
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
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
            <p className="text-muted-foreground">
              Customize email templates sent to users for registration and vehicle assignments
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Setup Required
              </CardTitle>
              <CardDescription>
                The email templates table has not been created yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                  <strong>Action Required:</strong> Run the SQL migration to create the email_templates table.
                </p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                  <li>Open your Supabase Dashboard</li>
                  <li>Go to SQL Editor</li>
                  <li>Copy and paste the contents of <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">CREATE_EMAIL_TEMPLATES_TABLE.sql</code></li>
                  <li>Click "Run" to execute the migration</li>
                  <li>Refresh this page</li>
                </ol>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Alternative:</p>
                <p className="text-sm text-muted-foreground">
                  If you're using Supabase CLI, run: <code className="bg-background px-1 rounded">supabase migration up</code>
                </p>
              </div>
            </CardContent>
          </Card>
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
            Customize email templates sent to users for registration, alerts, and notifications
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Template List */}
          <Card>
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
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedTemplate?.id === template.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description || template.template_key}
                      </p>
                      <code className="text-xs text-muted-foreground mt-1 block">{template.template_key}</code>
                    </div>
                    {template.is_active && (
                      <Badge variant="secondary" className="text-xs ml-2">Active</Badge>
                    )}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Template Editor & Preview */}
          <Card className="lg:col-span-2">
            <CardHeader>
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
                          <pre className="text-xs text-muted-foreground overflow-auto">
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
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editedTemplate ? (
                <Tabs defaultValue="edit" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="edit" className="space-y-4 mt-4">
                    {/* Status Toggle */}
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                      <div className="space-y-0.5">
                        <Label className="text-base">Active Status</Label>
                        <p className="text-sm text-muted-foreground">
                          {editedTemplate.is_active 
                            ? "This email type is currently enabled and will be sent to customers."
                            : "This email type is currently disabled and will NOT be sent."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {editedTemplate.is_active ? (
                          <Badge className="bg-green-500 hover:bg-green-600 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Enabled
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> Disabled
                          </Badge>
                        )}
                        <Switch 
                          checked={editedTemplate.is_active}
                          onCheckedChange={(checked) => setEditedTemplate({
                            ...editedTemplate,
                            is_active: checked
                          })}
                        />
                      </div>
                    </div>

                    {/* Available Variables */}
                    {editedTemplate.variables && editedTemplate.variables.length > 0 && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
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
                      <Label>Sender ID (optional)</Label>
                      <Input
                        value={editedTemplate.sender_id || ""}
                        onChange={(e) => setEditedTemplate({
                          ...editedTemplate,
                          sender_id: e.target.value || null
                        })}
                        placeholder="Sender Name <sender@example.com>"
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom sender name and email. Leave empty to use default Gmail account.
                      </p>
                    </div>

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
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
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
                  </TabsContent>

                  <TabsContent value="preview" className="mt-4">
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span className="text-sm font-medium">Email Preview</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {editedTemplate.subject ? replaceTemplateVariables(editedTemplate.subject, getSampleData(editedTemplate.template_key)) : "No subject"}
                        </Badge>
                      </div>
                      <div className="bg-white p-4">
                        <iframe
                          srcDoc={previewHtml}
                          className="w-full border-0"
                          style={{ minHeight: '600px', height: '600px' }}
                          title="Email Preview"
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
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
