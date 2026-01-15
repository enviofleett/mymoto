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
  const { user } = useAuth();
  const [terms, setTerms] = useState("");
  const [version, setVersion] = useState("1.0");
  const [originalTerms, setOriginalTerms] = useState("");
  const [originalVersion, setOriginalVersion] = useState("1.0");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [termsData, setTermsData] = useState<TermsData | null>(null);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("privacy_security_terms")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setTerms(data.terms_content);
        setVersion(data.version);
        setOriginalTerms(data.terms_content);
        setOriginalVersion(data.version);
        setTermsData(data);
      } else {
        // No terms exist, use empty
        setTerms("");
        setVersion("1.0");
        setOriginalTerms("");
        setOriginalVersion("1.0");
      }
    } catch (error) {
      console.error("Error fetching terms:", error);
      toast.error("Failed to load privacy & security terms");
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
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
