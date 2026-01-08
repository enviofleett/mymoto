import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Languages, UserCircle, Save } from "lucide-react";

interface VehiclePersonaSettingsProps {
  deviceId: string;
  vehicleName: string;
}

interface LlmSettings {
  device_id: string;
  nickname: string | null;
  language_preference: string;
  personality_mode: string;
  llm_enabled: boolean;
}

const LANGUAGES = [
  { value: 'english', label: 'English', sample: 'Hello! I am your vehicle companion.' },
  { value: 'pidgin', label: 'Nigerian Pidgin', sample: 'How far! Na me be your motor wey dey talk.' },
  { value: 'yoruba', label: 'Yoruba', sample: 'Ẹ kú àárọ̀! Mo jẹ́ ọkọ̀ rẹ̀.' },
  { value: 'hausa', label: 'Hausa', sample: 'Sannu! Ni ne mota ka mai magana.' },
  { value: 'igbo', label: 'Igbo', sample: 'Ndewo! Abụ m ụgbọala gị.' },
];

const PERSONALITIES = [
  { value: 'casual', label: 'Casual & Friendly', description: 'Relaxed, uses colloquialisms, feels like a friend' },
  { value: 'professional', label: 'Professional', description: 'Formal, precise, business-like communication' },
];

export function VehiclePersonaSettings({ deviceId, vehicleName }: VehiclePersonaSettingsProps) {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState("");
  const [language, setLanguage] = useState("english");
  const [personality, setPersonality] = useState("casual");
  const [llmEnabled, setLlmEnabled] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [deviceId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vehicle_llm_settings')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setNickname(data.nickname || "");
        setLanguage(data.language_preference);
        setPersonality(data.personality_mode);
        setLlmEnabled(data.llm_enabled);
      } else {
        // Defaults for new settings
        setNickname("");
        setLanguage("english");
        setPersonality("casual");
        setLlmEnabled(true);
      }
    } catch (err) {
      console.error('Error fetching LLM settings:', err);
      toast({
        title: "Error",
        description: "Failed to load persona settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vehicle_llm_settings')
        .upsert({
          device_id: deviceId,
          nickname: nickname.trim() || null,
          language_preference: language,
          personality_mode: personality,
          llm_enabled: llmEnabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });

      if (error) throw error;

      toast({
        title: "Saved!",
        description: "Persona settings updated successfully"
      });
      fetchSettings();
    } catch (err) {
      console.error('Error saving LLM settings:', err);
      toast({
        title: "Error",
        description: "Failed to save persona settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedLang = LANGUAGES.find(l => l.value === language);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading persona settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* LLM Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${llmEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
            <Sparkles className={`h-5 w-5 ${llmEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className="font-medium">AI Companion</p>
            <p className="text-sm text-muted-foreground">
              {llmEnabled ? 'Active - Vehicle can chat' : 'Paused - Chat disabled'}
            </p>
          </div>
        </div>
        <Switch
          checked={llmEnabled}
          onCheckedChange={setLlmEnabled}
        />
      </div>

      {/* Nickname */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          Vehicle Nickname
        </Label>
        <Input
          placeholder={vehicleName}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={!llmEnabled}
        />
        <p className="text-xs text-muted-foreground">
          Give the vehicle a personality name (e.g., "Big Daddy", "Speed Queen")
        </p>
      </div>

      {/* Language Preference */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-muted-foreground" />
          Language Preference
        </Label>
        <Select value={language} onValueChange={setLanguage} disabled={!llmEnabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border z-50">
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedLang && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Sample greeting:</p>
            <p className="text-sm italic">"{selectedLang.sample}"</p>
          </div>
        )}
      </div>

      {/* Personality Mode */}
      <div className="space-y-2">
        <Label>Personality Style</Label>
        <div className="grid grid-cols-2 gap-3">
          {PERSONALITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={!llmEnabled}
              onClick={() => setPersonality(p.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                personality === p.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              } ${!llmEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <p className="font-medium text-sm">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Save Persona Settings
          </>
        )}
      </Button>
    </div>
  );
}
