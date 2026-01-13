import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bot, Loader2, CheckCircle2, XCircle, Clock, Plus, Trash2, 
  MapPin, Wrench, BarChart3, Terminal, Sparkles, Lock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SimulationResult {
  deviceId: string;
  vehicleName: string;
  scenario: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

interface ScenarioTemplate {
  id: string;
  name: string;
  prompt: string;
  category: string;
  is_system: boolean;
}

interface VehicleAssignment {
  device_id: string;
  vehicle_alias: string | null;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  location: <MapPin className="h-3 w-3" />,
  maintenance: <Wrench className="h-3 w-3" />,
  analytics: <BarChart3 className="h-3 w-3" />,
  command: <Terminal className="h-3 w-3" />,
  personality: <Sparkles className="h-3 w-3" />,
  general: <Bot className="h-3 w-3" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  location: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  maintenance: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  analytics: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  command: "bg-red-500/10 text-red-500 border-red-500/20",
  personality: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  general: "bg-muted text-muted-foreground border-muted",
};

export function AiSimulationCard() {
  const [email, setEmail] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<SimulationResult[]>([]);
  
  // Templates state
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  
  // New template form
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplatePrompt, setNewTemplatePrompt] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("general");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await (supabase as any)
      .from('ai_scenario_templates')
      .select('*')
      .order('is_system', { ascending: false })
      .order('category')
      .order('name');

    if (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load scenario templates");
    } else {
      const templatesData = (data || []) as ScenarioTemplate[];
      setTemplates(templatesData);
      // Pre-select first 5 system templates by default
      const defaultSelected = new Set(
        templatesData.filter(t => t.is_system).slice(0, 5).map(t => t.id)
      );
      setSelectedTemplateIds(defaultSelected);
    }
    setLoadingTemplates(false);
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim()) {
      toast.error("Please enter both name and prompt");
      return;
    }

    setSavingTemplate(true);
    const { data, error } = await (supabase as any)
      .from('ai_scenario_templates')
      .insert({
        name: newTemplateName.trim(),
        prompt: newTemplatePrompt.trim(),
        category: newTemplateCategory,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved!");
      setTemplates(prev => [...prev, data as ScenarioTemplate]);
      setNewTemplateName("");
      setNewTemplatePrompt("");
      setNewTemplateCategory("general");
    }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await (supabase as any)
      .from('ai_scenario_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    } else {
      setTemplates(prev => prev.filter(t => t.id !== id));
      setSelectedTemplateIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Template deleted");
    }
  };

  const toggleTemplateSelection = (id: string) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSimulation = async () => {
    if (!email.trim()) {
      toast.error("Please enter a target user email");
      return;
    }

    if (selectedTemplateIds.size === 0) {
      toast.error("Please select at least one scenario template");
      return;
    }

    setIsSimulating(true);
    setResults([]);

    try {
      // 1. Resolve user by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, name')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (profileError) {
        throw new Error(`Failed to lookup user: ${profileError.message}`);
      }

      if (!profile) {
        toast.error("User not found with that email");
        setIsSimulating(false);
        return;
      }

      if (!profile.user_id) {
        toast.error("User has no linked auth account");
        setIsSimulating(false);
        return;
      }

      // 2. Get assigned vehicles
      const { data: assignments, error: assignmentsError } = await (supabase as any)
        .from('vehicle_assignments')
        .select('device_id, vehicle_alias')
        .eq('profile_id', profile.id);

      if (assignmentsError) {
        throw new Error(`Failed to fetch vehicles: ${assignmentsError.message}`);
      }

      const vehicleAssignments = (assignments || []) as VehicleAssignment[];

      if (vehicleAssignments.length === 0) {
        toast.error("No vehicles assigned to this user");
        setIsSimulating(false);
        return;
      }

      // 3. Get selected templates
      const selectedTemplates = templates.filter(t => selectedTemplateIds.has(t.id));

      // 4. Initialize results with pending status
      const initialResults: SimulationResult[] = vehicleAssignments.map((vehicle, index) => {
        const template = selectedTemplates[index % selectedTemplates.length];
        return {
          deviceId: vehicle.device_id,
          vehicleName: vehicle.vehicle_alias || vehicle.device_id,
          scenario: template.prompt,
          status: 'pending' as const,
        };
      });

      setResults(initialResults);
      toast.info(`Triggering AI for ${vehicleAssignments.length} vehicle(s) with ${selectedTemplates.length} scenario(s)...`);

      // 5. Trigger AI scenarios in parallel
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vehicle-chat`;

      const promises = vehicleAssignments.map(async (vehicle, index) => {
        const template = selectedTemplates[index % selectedTemplates.length];
        
        try {
          const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              device_id: vehicle.device_id,
              message: template.prompt,
              user_id: profile.user_id,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          // Read the streamed response
          const reader = response.body?.getReader();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          }

          return { deviceId: vehicle.device_id, success: true };
        } catch (error) {
          return { 
            deviceId: vehicle.device_id, 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          };
        }
      });

      const settled = await Promise.allSettled(promises);

      // 6. Update results based on responses
      setResults(prev => prev.map((result, index) => {
        const outcome = settled[index];
        if (outcome.status === 'fulfilled') {
          return {
            ...result,
            status: outcome.value.success ? 'success' : 'error',
            error: outcome.value.error,
          };
        }
        return {
          ...result,
          status: 'error',
          error: 'Promise rejected',
        };
      }));

      const successCount = settled.filter(
        s => s.status === 'fulfilled' && s.value.success
      ).length;

      toast.success(`Simulation complete: ${successCount}/${vehicleAssignments.length} successful`);

    } catch (error) {
      console.error("Simulation error:", error);
      toast.error(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const getStatusIcon = (status: SimulationResult['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: SimulationResult['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'success':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, ScenarioTemplate[]>);

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Simulation
        </CardTitle>
        <CardDescription>
          Test vehicle chat AI with customizable scenario templates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="simulate" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="simulate">Simulate</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          {/* Simulate Tab */}
          <TabsContent value="simulate" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label htmlFor="email">Target User Email</Label>
                <Input
                  id="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSimulating}
                  className="mt-1"
                />
              </div>

              {/* Selected Scenarios */}
              <div>
                <Label className="text-sm">Selected Scenarios ({selectedTemplateIds.size})</Label>
                <ScrollArea className="h-[120px] mt-1 rounded-md border p-2">
                  {loadingTemplates ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No templates available
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleTemplateSelection(template.id)}
                        >
                          <Checkbox
                            checked={selectedTemplateIds.has(template.id)}
                            onCheckedChange={() => toggleTemplateSelection(template.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{template.name}</span>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general}`}
                              >
                                {CATEGORY_ICONS[template.category]}
                                <span className="ml-1">{template.category}</span>
                              </Badge>
                              {template.is_system && (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {template.prompt}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <Button 
                onClick={handleSimulation} 
                disabled={isSimulating || !email.trim() || selectedTemplateIds.size === 0}
                className="w-full"
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "🚀 Simulate Chatter"
                )}
              </Button>
            </div>

            {results.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="text-sm font-medium text-muted-foreground">Results</h4>
                <ScrollArea className="h-[150px]">
                  <div className="space-y-2 pr-2">
                    {results.map((result) => (
                      <div 
                        key={result.deviceId}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                      >
                        {getStatusIcon(result.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {result.vehicleName}
                            </span>
                            {getStatusBadge(result.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            "{result.scenario}"
                          </p>
                          {result.error && (
                            <p className="text-xs text-destructive mt-1">{result.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            {/* Create New Template */}
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create New Template
              </h4>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="templateName" className="text-xs">Name</Label>
                    <Input
                      id="templateName"
                      placeholder="Template name"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="templateCategory" className="text-xs">Category</Label>
                    <Select value={newTemplateCategory} onValueChange={setNewTemplateCategory}>
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="location">Location</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="analytics">Analytics</SelectItem>
                        <SelectItem value="command">Command</SelectItem>
                        <SelectItem value="personality">Personality</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="templatePrompt" className="text-xs">Prompt</Label>
                  <Textarea
                    id="templatePrompt"
                    placeholder="Enter the scenario prompt..."
                    value={newTemplatePrompt}
                    onChange={(e) => setNewTemplatePrompt(e.target.value)}
                    className="text-sm mt-1 resize-none"
                    rows={3}
                  />
                </div>
                <Button 
                  size="sm" 
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !newTemplateName.trim() || !newTemplatePrompt.trim()}
                >
                  {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Template
                </Button>
              </div>
            </div>

            {/* Existing Templates */}
            <div>
              <h4 className="text-sm font-medium mb-2">Existing Templates</h4>
              <ScrollArea className="h-[200px]">
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : Object.entries(groupedTemplates).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No templates yet
                  </p>
                ) : (
                  <div className="space-y-4 pr-2">
                    {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          {CATEGORY_ICONS[category]}
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {category}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {categoryTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50"
                            >
                              <div className="flex-1 min-w-0 mr-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{template.name}</span>
                                  {template.is_system && (
                                    <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {template.prompt}
                                </p>
                              </div>
                              {!template.is_system && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => handleDeleteTemplate(template.id)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
