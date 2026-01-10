import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Languages, UserCircle, Save, Camera, Car } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  avatar_url: string | null;
}

const LANGUAGES = [
  { value: 'english', label: 'English', sample: 'Hello! I am your vehicle companion.' },
  { value: 'pidgin', label: 'Nigerian Pidgin', sample: 'How far! Na me be your motor wey dey talk.' },
  { value: 'yoruba', label: 'Yoruba', sample: 'Ẹ kú àárọ̀! Mo jẹ́ ọkọ̀ rẹ̀.' },
  { value: 'hausa', label: 'Hausa', sample: 'Sannu! Ni ne mota ka mai magana.' },
  { value: 'igbo', label: 'Igbo', sample: 'Ndewo! Abụ m ụgbọala gị.' },
  { value: 'french', label: 'French', sample: 'Bonjour! Je suis votre compagnon de véhicule.' },
];

const PERSONALITIES = [
  { value: 'casual', label: 'Casual & Friendly', description: 'Relaxed, uses colloquialisms, feels like a friend' },
  { value: 'professional', label: 'Professional', description: 'Formal, precise, business-like communication' },
  { value: 'funny', label: 'Funny', description: 'Witty, humorous, and entertaining' },
];

export function VehiclePersonaSettings({ deviceId, vehicleName }: VehiclePersonaSettingsProps) {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState("");
  const [language, setLanguage] = useState("english");
  const [personality, setPersonality] = useState("casual");
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        setAvatarUrl(data.avatar_url);
      } else {
        // Defaults for new settings
        setNickname("");
        setLanguage("english");
        setPersonality("casual");
        setLlmEnabled(true);
        setAvatarUrl(null);
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

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image under 2MB",
        variant: "destructive"
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${deviceId}-${Date.now()}.${fileExt}`;
      const filePath = `vehicle-avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(urlData.publicUrl);
      toast({
        title: "Uploaded!",
        description: "Avatar image uploaded successfully"
      });
    } catch (err) {
      console.error('Error uploading avatar:', err);
      toast({
        title: "Upload failed",
        description: "Failed to upload avatar image",
        variant: "destructive"
      });
    } finally {
      setUploadingAvatar(false);
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
          avatar_url: avatarUrl,
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

      {/* Vehicle Identity Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Vehicle Identity
        </Label>
        
        {/* Avatar Picker */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={avatarUrl || undefined} alt={nickname || vehicleName} />
              <AvatarFallback className="bg-muted">
                <Car className="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!llmEnabled || uploadingAvatar}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Vehicle Avatar</p>
            <p className="text-xs text-muted-foreground">
              Upload a photo to give your vehicle a unique identity
            </p>
          </div>
        </div>

        {/* Nickname */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            Nickname
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
