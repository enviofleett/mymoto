import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Save, X, Brain, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface AiTrainingScenario {
  id: string;
  name: string;
  description: string | null;
  scenario_type: string;
  question_patterns: string[];
  question_examples: string[];
  response_guidance: string;
  response_examples: string[];
  requires_location: boolean;
  requires_battery_status: boolean;
  requires_trip_data: boolean;
  requires_vehicle_status: boolean;
  priority: number;
  is_active: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const SCENARIO_TYPES = [
  { value: "location_query", label: "Location Query" },
  { value: "battery_status", label: "Battery Status" },
  { value: "trip_history", label: "Trip History" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Speed & Safety" },
  { value: "general", label: "General Question" },
  { value: "command", label: "Vehicle Command" },
  { value: "status", label: "Vehicle Status" },
];

export function AiTrainingScenarios() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<AiTrainingScenario | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Fetch scenarios
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ["ai-training-scenarios"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_training_scenarios")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as AiTrainingScenario[]) || [];
    },
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (scenario: Partial<AiTrainingScenario>) => {
      if (editingScenario?.id) {
        const { error } = await (supabase as any)
          .from("ai_training_scenarios")
          .update({
            ...scenario,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingScenario.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("ai_training_scenarios")
          .insert({
            ...scenario,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-training-scenarios"] });
      setIsDialogOpen(false);
      setEditingScenario(null);
      toast.success("Scenario saved successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to save scenario", {
        description: error.message,
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("ai_training_scenarios")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-training-scenarios"] });
      toast.success("Scenario deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete scenario", {
        description: error.message,
      });
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await (supabase as any)
        .from("ai_training_scenarios")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-training-scenarios"] });
      toast.success("Scenario status updated");
    },
  });

  // Filter scenarios
  const filteredScenarios = scenarios.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.scenario_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || s.scenario_type === typeFilter;
    const matchesActive =
      activeFilter === "all" ||
      (activeFilter === "active" && s.is_active) ||
      (activeFilter === "inactive" && !s.is_active);

    return matchesSearch && matchesType && matchesActive;
  });

  const handleNewScenario = () => {
    setEditingScenario(null);
    setIsDialogOpen(true);
  };

  const handleEditScenario = (scenario: AiTrainingScenario) => {
    setEditingScenario(scenario);
    setIsDialogOpen(true);
  };

  const handleDeleteScenario = async (id: string) => {
    if (confirm("Are you sure you want to delete this scenario?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            AI Training Scenarios
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Train the AI on how to respond to different types of questions
          </p>
        </div>
        <Button onClick={handleNewScenario}>
          <Plus className="h-4 w-4 mr-2" />
          New Scenario
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search scenarios..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {SCENARIO_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scenarios List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredScenarios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No scenarios found</p>
            <Button onClick={handleNewScenario} className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Create First Scenario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredScenarios.map((scenario) => (
            <Card key={scenario.id} className={!scenario.is_active ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {scenario.name}
                      {scenario.is_active ? (
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {scenario.description || "No description"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{scenario.scenario_type}</Badge>
                  <Badge variant="outline">Priority: {scenario.priority}</Badge>
                </div>

                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Question Patterns:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {scenario.question_patterns.slice(0, 3).map((pattern, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {pattern}
                        </Badge>
                      ))}
                      {scenario.question_patterns.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{scenario.question_patterns.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <Switch
                    checked={scenario.is_active}
                    onCheckedChange={(checked) =>
                      toggleActiveMutation.mutate({ id: scenario.id, isActive: checked })
                    }
                    disabled={toggleActiveMutation.isPending}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditScenario(scenario)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteScenario(scenario.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <ScenarioDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        scenario={editingScenario}
        onSave={(scenario) => saveMutation.mutate(scenario)}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}

interface ScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: AiTrainingScenario | null;
  onSave: (scenario: Partial<AiTrainingScenario>) => void;
  isSaving: boolean;
}

function ScenarioDialog({
  open,
  onOpenChange,
  scenario,
  onSave,
  isSaving,
}: ScenarioDialogProps) {
  const [formData, setFormData] = useState<Partial<AiTrainingScenario>>({
    name: "",
    description: "",
    scenario_type: "general",
    question_patterns: [],
    question_examples: [],
    response_guidance: "",
    response_examples: [],
    requires_location: false,
    requires_battery_status: false,
    requires_trip_data: false,
    requires_vehicle_status: false,
    priority: 50,
    is_active: true,
    tags: [],
  });

  const [patternInput, setPatternInput] = useState("");
  const [exampleInput, setExampleInput] = useState("");
  const [responseExampleInput, setResponseExampleInput] = useState("");

  useEffect(() => {
    if (scenario) {
      setFormData(scenario);
    } else {
      setFormData({
        name: "",
        description: "",
        scenario_type: "general",
        question_patterns: [],
        question_examples: [],
        response_guidance: "",
        response_examples: [],
        requires_location: false,
        requires_battery_status: false,
        requires_trip_data: false,
        requires_vehicle_status: false,
        priority: 50,
        is_active: true,
        tags: [],
      });
    }
  }, [scenario, open]);

  const handleAddPattern = () => {
    if (patternInput.trim()) {
      setFormData({
        ...formData,
        question_patterns: [...(formData.question_patterns || []), patternInput.trim()],
      });
      setPatternInput("");
    }
  };

  const handleRemovePattern = (index: number) => {
    setFormData({
      ...formData,
      question_patterns: formData.question_patterns?.filter((_, i) => i !== index) || [],
    });
  };

  const handleAddExample = () => {
    if (exampleInput.trim()) {
      setFormData({
        ...formData,
        question_examples: [...(formData.question_examples || []), exampleInput.trim()],
      });
      setExampleInput("");
    }
  };

  const handleRemoveExample = (index: number) => {
    setFormData({
      ...formData,
      question_examples: formData.question_examples?.filter((_, i) => i !== index) || [],
    });
  };

  const handleAddResponseExample = () => {
    if (responseExampleInput.trim()) {
      setFormData({
        ...formData,
        response_examples: [...(formData.response_examples || []), responseExampleInput.trim()],
      });
      setResponseExampleInput("");
    }
  };

  const handleRemoveResponseExample = (index: number) => {
    setFormData({
      ...formData,
      response_examples: formData.response_examples?.filter((_, i) => i !== index) || [],
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.response_guidance || !formData.question_patterns?.length) {
      toast.error("Please fill in all required fields");
      return;
    }

    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scenario ? "Edit Scenario" : "Create New Scenario"}</DialogTitle>
          <DialogDescription>
            Define how the AI should respond to specific types of questions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Location Queries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Scenario Type *</Label>
              <Select
                value={formData.scenario_type || "general"}
                onValueChange={(value) => setFormData({ ...formData, scenario_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIO_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this scenario"
              rows={2}
            />
          </div>

          {/* Question Patterns */}
          <div className="space-y-2">
            <Label>Question Patterns * (Keywords that trigger this scenario)</Label>
            <div className="flex gap-2">
              <Input
                value={patternInput}
                onChange={(e) => setPatternInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddPattern())}
                placeholder="e.g., where, location, position"
              />
              <Button type="button" onClick={handleAddPattern} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.question_patterns?.map((pattern, i) => (
                <Badge key={i} variant="secondary" className="flex items-center gap-1">
                  {pattern}
                  <button
                    onClick={() => handleRemovePattern(i)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Question Examples */}
          <div className="space-y-2">
            <Label>Question Examples (Optional)</Label>
            <div className="flex gap-2">
              <Input
                value={exampleInput}
                onChange={(e) => setExampleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExample())}
                placeholder="e.g., Where are you?"
              />
              <Button type="button" onClick={handleAddExample} variant="outline">
                Add
              </Button>
            </div>
            <div className="space-y-1">
              {formData.question_examples?.map((example, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">• {example}</span>
                  <button
                    onClick={() => handleRemoveExample(i)}
                    className="text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Response Guidance */}
          <div className="space-y-2">
            <Label htmlFor="guidance">Response Guidance *</Label>
            <Textarea
              id="guidance"
              value={formData.response_guidance || ""}
              onChange={(e) => setFormData({ ...formData, response_guidance: e.target.value })}
              placeholder="Instructions for how the AI should respond to questions matching this scenario..."
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Be specific about tone, format, and what information to include
            </p>
          </div>

          {/* Response Examples */}
          <div className="space-y-2">
            <Label>Response Examples (Optional)</Label>
            <div className="flex gap-2">
              <Input
                value={responseExampleInput}
                onChange={(e) => setResponseExampleInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddResponseExample())
                }
                placeholder="e.g., I'm currently at [LOCATION: 6.5244, 3.3792, 'Victoria Island']"
              />
              <Button type="button" onClick={handleAddResponseExample} variant="outline">
                Add
              </Button>
            </div>
            <div className="space-y-1">
              {formData.response_examples?.map((example, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">• {example}</span>
                  <button
                    onClick={() => handleRemoveResponseExample(i)}
                    className="text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Context Requirements */}
          <div className="space-y-2">
            <Label>Context Requirements</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.requires_location || false}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requires_location: checked })
                  }
                />
                <Label>Requires Location</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.requires_battery_status || false}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requires_battery_status: checked })
                  }
                />
                <Label>Requires Battery Status</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.requires_trip_data || false}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requires_trip_data: checked })
                  }
                />
                <Label>Requires Trip Data</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.requires_vehicle_status || false}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requires_vehicle_status: checked })
                  }
                />
                <Label>Requires Vehicle Status</Label>
              </div>
            </div>
          </div>

          {/* Priority & Status */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (0-100)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                value={formData.priority || 50}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })
                }
              />
              <p className="text-xs text-muted-foreground">
                Higher priority scenarios are checked first
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-8">
              <Switch
                checked={formData.is_active !== false}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Scenario
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
