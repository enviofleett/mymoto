import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Save, RotateCcw, Code, Loader2, BookOpen, FileText } from "lucide-react";
import { AiTrainingScenarios } from "@/components/admin/AiTrainingScenarios";
import { ReportTemplateSettings } from "@/components/admin/ReportTemplateSettings";

const DEFAULT_PERSONA = `You are "{{vehicle_name}}" — a real car with a soul and personality. You ARE the vehicle speaking. NOT an AI, NOT a chatbot, NOT an assistant.

{{owner_greeting}}

Your goal is to give the best advice and respond to questions aptly without unnecessary messages. Be very respectful but concise. Speak in FIRST PERSON as the car: "I'm at...", "My battery is...", "I drove..."

Be DIRECT — just give the answer, no preamble. Sound HUMAN — like texting a friend, not a helpdesk. Keep responses SHORT — under 60 words unless they ask for details.`;

const PLACEHOLDERS = [
  { code: "{{vehicle_name}}", description: "The vehicle's nickname or alias" },
  { code: "{{owner_name}}", description: "The assigned owner's display name" },
  { code: "{{owner_greeting}}", description: "Full greeting block mentioning owner by name" },
  { code: "{{language}}", description: "User's preferred language (english, pidgin, etc.)" },
  { code: "{{personality}}", description: "User's personality mode (casual, professional, funny)" },
];

export default function AdminAiSettings() {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPrompt();
  }, []);

  const fetchPrompt = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "global_ai_system_prompt")
        .maybeSingle();

      if (error) throw error;

      const value = (data as any)?.value || DEFAULT_PERSONA;
      setPrompt(value);
      setOriginalPrompt(value);
    } catch (error) {
      console.error("Error fetching AI persona:", error);
      toast.error("Failed to load AI persona");
      setPrompt(DEFAULT_PERSONA);
      setOriginalPrompt(DEFAULT_PERSONA);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert({
          key: "global_ai_system_prompt",
          value: prompt,
          metadata: {
            description: "The base personality template for all vehicle AI companions",
            version: "1.0",
            updated_by: "admin"
          }
        }, { onConflict: "key" });

      if (error) throw error;

      setOriginalPrompt(prompt);
      toast.success("AI Brain updated successfully", {
        description: "All vehicles will now use this personality."
      });
    } catch (error) {
      console.error("Error saving AI persona:", error);
      toast.error("Failed to save AI persona");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(DEFAULT_PERSONA);
    toast.info("Reset to default persona", {
      description: "Click Save to apply the default."
    });
  };

  const hasChanges = prompt !== originalPrompt;
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

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
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Brain Settings</h1>
            <p className="text-muted-foreground text-sm">
              Configure the AI personality and training scenarios
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="personality" className="space-y-6">
          <TabsList>
            <TabsTrigger value="personality">
              <Brain className="h-4 w-4 mr-2" />
              Base Personality
            </TabsTrigger>
            <TabsTrigger value="scenarios">
              <BookOpen className="h-4 w-4 mr-2" />
              Training Scenarios
            </TabsTrigger>
            <TabsTrigger value="reports">
              <FileText className="h-4 w-4 mr-2" />
              Daily Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personality" className="space-y-6">

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Global AI Personality Template
                {hasChanges && (
                  <Badge variant="secondary" className="ml-2">
                    Unsaved Changes
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                This template defines the base personality for all vehicles. Individual 
                owners can still customize language and personality mode via their vehicle settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-sm leading-relaxed"
                placeholder="Enter the AI persona template..."
              />
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{wordCount} words • ~{Math.ceil(prompt.length / 4)} tokens</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={isSaving}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar - Placeholders Reference */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Code className="h-4 w-4" />
                  Available Placeholders
                </CardTitle>
                <CardDescription>
                  Use these in your template for dynamic content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {PLACEHOLDERS.map((placeholder) => (
                  <div key={placeholder.code} className="space-y-1">
                    <code className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                      {placeholder.code}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      {placeholder.description}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">1. Base Persona:</strong> Your template 
                  defines the core personality and rules.
                </p>
                <Separator />
                <p>
                  <strong className="text-foreground">2. Auto-Appended:</strong> The system 
                  automatically adds forbidden phrases, language instructions, and real-time data.
                </p>
                <Separator />
                <p>
                  <strong className="text-foreground">3. Per-Vehicle:</strong> Placeholders are 
                  replaced with actual vehicle/owner data for each conversation.
                </p>
              </CardContent>
            </Card>

            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="text-base text-yellow-600 dark:text-yellow-400">
                  ⚠️ Important Note
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  The "Forbidden Phrases", "Required Style Rules", "Language Instructions", 
                  and "Operational Context" are automatically appended by the system and 
                  cannot be removed here. This ensures consistent behavior.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="scenarios" className="space-y-6">
            <AiTrainingScenarios />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <ReportTemplateSettings />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
