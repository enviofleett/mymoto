import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield, Save, RotateCcw, Loader2, Eye, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

interface TermsData {
  id: string;
  terms_content: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export default function AdminPrivacySettings() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [terms, setTerms] = useState("");
  const [version, setVersion] = useState("1.0");
  const [originalTerms, setOriginalTerms] = useState("");
  const [originalVersion, setOriginalVersion] = useState("1.0");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [termsData, setTermsData] = useState<TermsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!isAdmin) {
        setError("You must be an administrator to access this page.");
        setIsLoading(false);
        return;
      }
      fetchTerms();
    }
  }, [isAdmin, authLoading]);

  const fetchTerms = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get the most recent active term (in case multiple are active)
      const { data, error: queryError } = await (supabase as any)
        .from("privacy_security_terms")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) {
        // Handle specific error codes
        if (queryError.code === 'PGRST116') {
          // No rows found - this is okay, means no terms exist yet
          setTerms("");
          setVersion("1.0");
          setOriginalTerms("");
          setOriginalVersion("1.0");
          setTermsData(null);
        } else if (queryError.code === '42P01') {
          // Table doesn't exist
          setError("The privacy_security_terms table does not exist. Please run the database migration first.");
          console.error("Table not found:", queryError);
        } else if (queryError.code === '42501') {
          // Permission denied
          setError("You don't have permission to access privacy & security terms. Please ensure you have admin role.");
          console.error("Permission denied:", queryError);
        } else {
          throw queryError;
        }
        return;
      }

      if (data) {
        setTerms(data.terms_content || "");
        setVersion(data.version || "1.0");
        setOriginalTerms(data.terms_content || "");
        setOriginalVersion(data.version || "1.0");
        setTermsData(data);
      } else {
        // No terms exist, use default template
        const defaultTerms = `PRIVACY & SECURITY TERMS

Last Updated: ${new Date().toLocaleDateString()}

1. DATA COLLECTION AND USAGE

MyMoto collects and processes the following information to provide our vehicle tracking and management services:

• Vehicle Location Data: GPS coordinates, speed, heading, and movement patterns
• Vehicle Status: Battery level, ignition status, mileage, and diagnostic information
• User Account Information: Name, email, phone number, and profile preferences
• Usage Data: App interactions, feature usage, and communication logs

We use this data to:
• Provide real-time vehicle tracking and monitoring
• Generate trip reports and analytics
• Send proactive notifications and alerts
• Improve our services and user experience
• Ensure platform security and prevent fraud

2. DATA STORAGE AND SECURITY

• All data is encrypted in transit and at rest
• We use industry-standard security measures to protect your information
• Location data is stored securely and retained according to our data retention policy
• Access to your data is restricted to authorized personnel only

3. LOCATION TRACKING

• Location tracking is enabled when you use MyMoto services
• You can disable location tracking in your account settings
• Historical location data is used to generate trip reports and analytics
• Location data is shared only with authorized users assigned to your vehicles

4. THIRD-PARTY SERVICES

• We use third-party services (GPS51, Mapbox) for core functionality
• These services may process your data according to their own privacy policies
• We do not sell your personal information to third parties

5. USER RIGHTS

You have the right to:
• Access your personal data
• Request correction of inaccurate data
• Request deletion of your account and data
• Opt-out of non-essential data collection
• Export your data in a portable format

6. DATA RETENTION

• Active account data is retained while your account is active
• Location history is retained for up to 90 days
• Trip records are retained for up to 1 year
• Deleted account data is permanently removed within 30 days

7. COMMUNICATIONS

• We may send you notifications about vehicle alerts, system updates, and important information
• You can manage notification preferences in your account settings
• Marketing communications are opt-in only

8. CHILDREN'S PRIVACY

• MyMoto is not intended for users under 18 years of age
• We do not knowingly collect data from children

9. CHANGES TO TERMS

• We may update these terms from time to time
• You will be notified of significant changes
• Continued use of the service constitutes acceptance of updated terms

10. CONTACT US

For privacy concerns or data requests, contact us at:
Email: privacy@mymoto.com
Support: support@mymoto.com

By using MyMoto, you acknowledge that you have read, understood, and agree to these Privacy & Security Terms.`;

        setTerms(defaultTerms);
        setVersion("1.0");
        setOriginalTerms("");
        setOriginalVersion("1.0");
        setTermsData(null);
      }
    } catch (error: any) {
      console.error("Error fetching terms:", error);
      const errorMessage = error?.message || "Failed to load privacy & security terms";
      setError(errorMessage);
      toast.error("Failed to load privacy & security terms", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!terms.trim()) {
      toast.error("Terms content cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      // Deactivate old terms
      if (termsData) {
        await (supabase as any)
          .from("privacy_security_terms")
          .update({ is_active: false })
          .eq("id", termsData.id);
      }

      // Create new version
      const { error } = await (supabase as any)
        .from("privacy_security_terms")
        .insert({
          terms_content: terms.trim(),
          version: version.trim(),
          is_active: true,
          updated_by: user?.id,
        });

      if (error) throw error;

      await fetchTerms(); // Refresh to get new data
      toast.success("Privacy & Security Terms updated successfully", {
        description: `Version ${version} is now active. New users will see these terms.`,
      });
    } catch (error: any) {
      console.error("Error saving terms:", error);
      toast.error("Failed to save terms", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTerms(originalTerms);
    setVersion(originalVersion);
    toast.info("Reset to current version", {
      description: "Click Save to apply changes.",
    });
  };

  const hasChanges = terms !== originalTerms || version !== originalVersion;
  const wordCount = terms.trim().split(/\s+/).filter(Boolean).length;
  const charCount = terms.length;

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Shield className="h-5 w-5" />
                Access Denied
              </CardTitle>
              <CardDescription>
                You must be an administrator to access this page.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Privacy & Security Terms</h1>
              <p className="text-muted-foreground text-sm">
                Manage the privacy and security terms that users must agree to
              </p>
            </div>
          </div>
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error Loading Terms</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {error.includes("table does not exist") ? (
                    <>
                      The database table is missing. Please run the migration:
                      <code className="block mt-2 p-2 bg-muted rounded text-xs">
                        RUN_THIS_MIGRATION_PRIVACY_TERMS.sql
                      </code>
                    </>
                  ) : error.includes("permission") ? (
                    <>
                      You don't have the required permissions. Please ensure:
                      <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                        <li>You have admin role assigned in the database</li>
                        <li>The RLS policies are correctly configured</li>
                        <li>You are logged in with the correct account</li>
                      </ul>
                    </>
                  ) : (
                    "Please check the console for more details and try again."
                  )}
                </p>
                <Button onClick={fetchTerms} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-32">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Privacy & Security Terms</h1>
            <p className="text-muted-foreground text-sm">
              Manage the privacy and security terms that users must agree to
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Terms Content
                    {hasChanges && (
                      <Badge variant="outline" className="text-xs">
                        Unsaved changes
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Edit the privacy and security terms. New version will be shown to new users.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={!hasChanges || isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || isSaving || !terms.trim()}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Terms
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Version Input */}
              <div className="space-y-2">
                <Label htmlFor="version">Version Number</Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g., 1.0, 1.1, 2.0"
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Increment version when making significant changes
                </p>
              </div>

              <Separator />

              {/* Terms Editor */}
              <div className="space-y-2">
                <Label htmlFor="terms">Terms Content</Label>
                <Textarea
                  id="terms"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter privacy and security terms..."
                  className="min-h-[500px] font-mono text-sm"
                  disabled={isSaving}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{wordCount} words, {charCount} characters</span>
                  <span>Markdown supported</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {termsData ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Version</span>
                      <Badge variant="secondary">{termsData.version}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Created</span>
                    </div>
                    <p className="text-sm font-medium">
                      {format(new Date(termsData.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>

                  {termsData.updated_at && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Last Updated</span>
                      </div>
                      <p className="text-sm font-medium">
                        {format(new Date(termsData.updated_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm">Preview</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        // Open preview in new window
                        const previewWindow = window.open("", "_blank");
                        if (previewWindow) {
                          previewWindow.document.write(`
                            <html>
                              <head>
                                <title>Privacy & Security Terms Preview</title>
                                <style>
                                  body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
                                  h1 { color: #333; }
                                  pre { white-space: pre-wrap; }
                                </style>
                              </head>
                              <body>
                                <h1>Privacy & Security Terms</h1>
                                <pre>${terms.replace(/\n/g, "<br>")}</pre>
                              </body>
                            </html>
                          `);
                        }
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview Terms
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">No terms set yet</p>
                  <p className="text-xs mt-2">Create your first version</p>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm">Tips</Label>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Use clear, simple language</li>
                  <li>Include data collection details</li>
                  <li>Explain user rights</li>
                  <li>Specify retention periods</li>
                  <li>Update version for major changes</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
