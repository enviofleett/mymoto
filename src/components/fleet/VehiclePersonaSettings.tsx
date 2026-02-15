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
  const [nicknameAvailable, setNicknameAvailable] = useState<boolean | null>(null);
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const nicknameCheckTimeout = useRef<number | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [deviceId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('vehicle_llm_settings')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as LlmSettings);
        setNickname((data as any).nickname || "");
        setLanguage((data as any).language_preference || "english");
        setPersonality((data as any).personality_mode || "casual");
        // Ensure llm_enabled defaults to true if null/undefined (never auto-disable)
        setLlmEnabled((data as any).llm_enabled ?? true);
        setAvatarUrl((data as any).avatar_url);
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
      // Center-crop to square and resize to 512x512 client-side
      const imageBitmap = await createImageBitmap(file);
      const size = Math.min(imageBitmap.width, imageBitmap.height);
      const sx = Math.floor((imageBitmap.width - size) / 2);
      const sy = Math.floor((imageBitmap.height - size) / 2);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(imageBitmap, sx, sy, size, size, 0, 0, 512, 512);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png', 0.92));

      const fileName = `${deviceId}-${Date.now()}.png`;
      const filePath = `vehicle-avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true });

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

  // Debounced nickname availability check
  useEffect(() => {
    if (!nickname?.trim()) {
      setNicknameAvailable(null);
      return;
    }
    setNicknameChecking(true);
    if (nicknameCheckTimeout.current) {
      window.clearTimeout(nicknameCheckTimeout.current);
    }
    nicknameCheckTimeout.current = window.setTimeout(async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('vehicle_llm_settings')
          .select('device_id')
          .eq('nickname', nickname.trim())
          .neq('device_id', deviceId)
          .limit(1);
        if (error) throw error;
        setNicknameAvailable(!data || (data as any[]).length === 0);
      } catch {
        setNicknameAvailable(null);
      } finally {
        setNicknameChecking(false);
      }
    }, 400);
    return () => {
      if (nicknameCheckTimeout.current) {
        window.clearTimeout(nicknameCheckTimeout.current);
        nicknameCheckTimeout.current = null;
      }
    };
  }, [nickname, deviceId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Step 1: Ensure vehicle exists in vehicles table
      const { data: vehicleExists, error: vehicleCheckError } = await (supabase as any)
        .from('vehicles')
        .select('device_id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (vehicleCheckError) {
        console.error('Error checking vehicle existence:', vehicleCheckError);
        throw vehicleCheckError;
      }

      if (!vehicleExists) {
        // Create minimal vehicle entry to satisfy foreign key constraint
        const { error: vehicleCreateError } = await (supabase as any)
          .from('vehicles')
          .upsert({
            device_id: deviceId,
            device_name: vehicleName,
          }, { onConflict: 'device_id' });

        if (vehicleCreateError) {
          console.error('Failed to create vehicle entry:', vehicleCreateError);

          // Check if it's an RLS policy error
          if ('code' in vehicleCreateError && vehicleCreateError.code === '42501') {
            toast({
              title: "Permission Denied",
              description: "You do not have permission to edit this vehicle.",
              variant: "destructive"
            });
            setSaving(false);
            return;
          }

          toast({
            title: "Error",
            description: "Vehicle not found in system. Please contact support.",
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
      }

      // Step 2: Validate values before saving
      const validLanguages = ['english', 'pidgin', 'yoruba', 'hausa', 'igbo'];
      const validPersonalities = ['casual', 'professional', 'funny'];
      
      if (!validLanguages.includes(language)) {
        toast({
          title: "Invalid Language",
          description: `Language "${language}" is not supported. Please select a valid option.`,
          variant: "destructive"
        });
        setSaving(false);
        return;
      }
      
      if (!validPersonalities.includes(personality)) {
        toast({
          title: "Invalid Personality",
          description: `Personality "${personality}" is not supported. Please select a valid option.`,
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // Step 3: Save LLM settings
      // Ensure llm_enabled is never null/undefined - always true or false (explicit user choice)
      const { error } = await (supabase as any)
        .from('vehicle_llm_settings')
        .upsert({
          device_id: deviceId,
          nickname: nickname.trim() || null,
          language_preference: language,
          personality_mode: personality,
          llm_enabled: llmEnabled ?? true, // Default to true if somehow null
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'device_id' });

      if (error) {
        // Handle constraint violation errors
        if ('code' in error && error.code === '23514') {
          // If 'funny' personality mode fails, it means the migration hasn't run yet
          // Fall back to 'casual' and retry
          if (personality === 'funny' && error.message?.includes('personality_mode')) {
            console.warn('Personality mode "funny" not yet supported in database, falling back to "casual"');
            setPersonality('casual');
            
            // Retry with 'casual'
            const { error: retryError } = await (supabase as any)
              .from('vehicle_llm_settings')
              .upsert({
                device_id: deviceId,
                nickname: nickname.trim() || null,
                language_preference: language,
                personality_mode: 'casual',
                llm_enabled: llmEnabled ?? true,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'device_id' });
            
            if (retryError) {
              throw retryError;
            }
            
            toast({
              title: "Saved with fallback",
              description: "Personality set to 'casual' (database migration pending for 'funny' mode)",
              variant: "default"
            });
            fetchSettings();
            setSaving(false);
            return;
          }
          
          const constraintName = error.message?.includes('language_preference') 
            ? 'language preference' 
            : error.message?.includes('personality_mode')
            ? 'personality mode'
            : 'setting';
          
          toast({
            title: "Invalid Setting Value",
            description: `The selected ${constraintName} is not supported. Please contact support if this persists.`,
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
        
        // Handle RLS policy errors specifically
        if ('code' in error && error.code === '42501') {
          toast({
            title: "Permission Denied",
            description: "You do not have permission to edit this vehicle's settings.",
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
        throw error;
      }

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

      {/* Personality Section */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Personality
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
            maxLength={50}
            disabled={!llmEnabled}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Give the vehicle a personality name (e.g., "Big Daddy", "Speed Queen")
            </p>
            <p className="text-[10px] text-muted-foreground">{nickname.length}/50</p>
          </div>
          {nickname && (
            <p className={`text-xs ${nicknameAvailable === false ? 'text-destructive' : 'text-muted-foreground'}`}>
              {nicknameChecking ? 'Checking availability...' : nicknameAvailable === false ? 'This nickname is already used by another vehicle' : 'Nickname is available'}
            </p>
          )}
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
