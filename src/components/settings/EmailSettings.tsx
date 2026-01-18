import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, CheckCircle, AlertCircle, Eye, EyeOff, Send, TestTube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface EmailConfig {
  gmail_user: string | null;
  gmail_app_password: string | null;
  email_enabled: boolean;
  test_email: string | null;
}

export function EmailSettings() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [config, setConfig] = useState<EmailConfig>({
    gmail_user: null,
    gmail_app_password: null,
    email_enabled: false,
    test_email: user?.email || null,
  });
  const [formData, setFormData] = useState({
    gmail_user: "",
    gmail_app_password: "",
    test_email: user?.email || "",
  });

  useEffect(() => {
    if (isAdmin) {
      fetchEmailConfig();
    }
  }, [isAdmin]);

  const fetchEmailConfig = async () => {
    try {
      setLoading(true);
      // Check if email config exists in app_settings
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("key, value, metadata")
        .in("key", ["gmail_user", "gmail_app_password", "email_enabled", "test_email"]);

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching email config:", error);
      }

      const settings = (data || []).reduce((acc: Record<string, string>, item: any) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, string>);

      setConfig({
        gmail_user: settings.gmail_user || null,
        gmail_app_password: settings.gmail_app_password ? "••••••••" : null,
        email_enabled: settings.email_enabled === "true",
        test_email: settings.test_email || user?.email || null,
      });

      setFormData({
        gmail_user: settings.gmail_user || "",
        gmail_app_password: "",
        test_email: settings.test_email || user?.email || "",
      });
    } catch (err) {
      console.error("Error loading email config:", err);
      toast({
        title: "Error",
        description: "Failed to load email configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can configure email settings",
        variant: "destructive",
      });
      return;
    }

    if (!formData.gmail_user || !formData.gmail_app_password) {
      toast({
        title: "Validation Error",
        description: "Gmail user and app password are required",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Save to app_settings table
      const settings = [
        { key: "gmail_user", value: formData.gmail_user },
        { key: "gmail_app_password", value: formData.gmail_app_password },
        { key: "email_enabled", value: config.email_enabled.toString() },
        { key: "test_email", value: formData.test_email },
      ];

      for (const setting of settings) {
        await (supabase as any)
          .from("app_settings")
          .upsert({
            key: setting.key,
            value: setting.value,
            metadata: {
              updated_at: new Date().toISOString(),
              updated_by: user?.email || "unknown",
            },
          }, { onConflict: "key" });
      }

      // Also update Supabase secrets (requires admin API)
      // Note: This would need to be done via Supabase dashboard or CLI
      // For now, we'll just save to app_settings and document that secrets need to be set manually

      toast({
        title: "Settings Saved",
        description: "Email configuration saved. Note: Gmail credentials must also be set in Supabase secrets (GMAIL_USER, GMAIL_APP_PASSWORD).",
      });

      await fetchEmailConfig();
    } catch (err) {
      console.error("Error saving email config:", err);
      toast({
        title: "Error",
        description: "Failed to save email configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!formData.test_email) {
      toast({
        title: "Validation Error",
        description: "Test email address is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setTesting(true);

      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          template: "systemNotification",
          to: formData.test_email,
          data: {
            title: "Test Email from MyMoto Fleet",
            message: "This is a test email to verify your email configuration is working correctly. If you received this, your email system is properly configured!",
            actionLink: window.location.origin,
            actionText: "Open Dashboard",
          },
        },
      });

      if (error) throw error;

      toast({
        title: "Test Email Sent",
        description: `Test email sent to ${formData.test_email}. Please check your inbox.`,
      });
    } catch (err: any) {
      console.error("Error sending test email:", err);
      toast({
        title: "Test Failed",
        description: err.message || "Failed to send test email. Please check your configuration.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = config.gmail_user && config.gmail_app_password;

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Settings
          </CardTitle>
          <CardDescription>Email configuration is only available to administrators</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Show templates even for non-admin users (read-only) */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium text-sm mb-2">Available Email Templates & Use Cases</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Alert:</strong> Vehicle alerts and notifications (critical/error events)</li>
              <li>• <strong>Password Reset:</strong> Password reset links (via Supabase Auth)</li>
              <li>• <strong>Welcome:</strong> New user welcome emails (sent automatically on signup)</li>
              <li>• <strong>Trip Summary:</strong> Trip completion summaries (sent automatically after trip ends)</li>
              <li>• <strong>System Notification:</strong> General system notifications and test emails</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              <strong>Note:</strong> Welcome and Trip Summary emails are sent automatically via database triggers. 
              Alert emails are sent when critical/error vehicle events occur.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-10 bg-muted animate-pulse rounded" />
          </div>
          {/* Show templates even during loading */}
          <div className="rounded-lg border bg-muted/50 p-4 mt-6">
            <h4 className="font-medium text-sm mb-2">Available Email Templates & Use Cases</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Alert:</strong> Vehicle alerts and notifications (critical/error events)</li>
              <li>• <strong>Password Reset:</strong> Password reset links (via Supabase Auth)</li>
              <li>• <strong>Welcome:</strong> New user welcome emails (sent automatically on signup)</li>
              <li>• <strong>Trip Summary:</strong> Trip completion summaries (sent automatically after trip ends)</li>
              <li>• <strong>System Notification:</strong> General system notifications and test emails</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
              <strong>Note:</strong> Welcome and Trip Summary emails are sent automatically via database triggers. 
              Alert emails are sent when critical/error vehicle events occur.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Configuration
            </CardTitle>
            <CardDescription>
              Configure Gmail SMTP for sending system emails
            </CardDescription>
          </div>
          <Badge variant={isConfigured ? "default" : "secondary"} className="flex items-center gap-1">
            {isConfigured ? (
              <>
                <CheckCircle className="h-3 w-3" />
                Configured
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Not Configured
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Templates Section - Moved to top for visibility */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <h4 className="font-medium text-sm mb-2">Available Email Templates & Use Cases</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• <strong>Alert:</strong> Vehicle alerts and notifications (critical/error events)</li>
            <li>• <strong>Password Reset:</strong> Password reset links (via Supabase Auth)</li>
            <li>• <strong>Welcome:</strong> New user welcome emails (sent automatically on signup)</li>
            <li>• <strong>Trip Summary:</strong> Trip completion summaries (sent automatically after trip ends)</li>
            <li>• <strong>System Notification:</strong> General system notifications and test emails</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            <strong>Note:</strong> Welcome and Trip Summary emails are sent automatically via database triggers. 
            Alert emails are sent when critical/error vehicle events occur.
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> The email system uses Supabase Edge Function secrets. Set <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in Supabase Dashboard → Project Settings → Edge Functions → Secrets. The settings below are stored in the database for reference only.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gmail_user">Gmail Address</Label>
            <Input
              id="gmail_user"
              type="email"
              placeholder="your-email@gmail.com"
              value={formData.gmail_user}
              onChange={(e) => setFormData({ ...formData, gmail_user: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The Gmail address to send emails from
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gmail_app_password">Gmail App Password</Label>
            <div className="flex gap-2">
              <Input
                id="gmail_app_password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter app password"
                value={formData.gmail_app_password}
                onChange={(e) => setFormData({ ...formData, gmail_app_password: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate an app password in your Google Account settings (Security → 2-Step Verification → App passwords)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test_email">Test Email Address</Label>
            <Input
              id="test_email"
              type="email"
              placeholder="test@example.com"
              value={formData.test_email}
              onChange={(e) => setFormData({ ...formData, test_email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Email address to send test emails to
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="email_enabled">Enable Email Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Enable or disable sending email notifications system-wide
              </p>
            </div>
            <Switch
              id="email_enabled"
              checked={config.email_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, email_enabled: checked })}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
          <Button
            onClick={handleTestEmail}
            disabled={testing || !isConfigured}
            variant="outline"
            className="flex items-center gap-2"
          >
            <TestTube className="h-4 w-4" />
            {testing ? "Sending..." : "Send Test Email"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
