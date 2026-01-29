import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProfileUpdated?: () => void;
}

interface UserProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function EditProfileDialog({ 
  open, 
  onOpenChange,
  onProfileUpdated 
}: EditProfileDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      fetchProfile();
    }
  }, [open, user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, phone, email, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setDisplayName(data.name || "");
        setPhone(data.phone || "");
        setAvatarUrl(data.avatar_url);
      } else {
        // No profile yet, use email prefix as default name
        setDisplayName(user.email?.split("@")[0] || "");
        setPhone("");
        setAvatarUrl(null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `profiles/${user.id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      setAvatarUrl(urlData.publicUrl);
      toast.success("Avatar uploaded successfully");
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }

    setSaving(true);
    try {
      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from("profiles")
          .update({
            name: displayName.trim(),
            phone: phone.trim() || null,
            avatar_url: avatarUrl,
          })
          .eq("id", profile.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            name: displayName.trim(),
            phone: phone.trim() || null,
            email: user.email,
            avatar_url: avatarUrl,
          });

        if (error) throw error;
      }

      toast.success("Profile updated successfully");
      onProfileUpdated?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-card border-0 shadow-neumorphic rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center">
              <User className="h-5 w-5 text-foreground" />
            </div>
            Edit Profile
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-12 h-12 rounded-full shadow-neumorphic bg-card flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full shadow-neumorphic bg-card p-1 overflow-hidden">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Profile" 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-muted/20 flex items-center justify-center">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                <label 
                  htmlFor="avatar-upload" 
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full shadow-neumorphic-sm bg-card flex items-center justify-center cursor-pointer hover:text-accent transition-colors"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Tap the camera icon to update your photo
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-foreground">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/30"
              />
              <p className="text-xs text-muted-foreground">
                This is how your AI assistant will address you
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+234 800 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-card border-0 shadow-neumorphic-inset h-12 rounded-xl focus-visible:ring-accent/30"
              />
              <p className="text-xs text-muted-foreground">
                For alerts and notifications
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className={cn(
                  "flex-1 h-12 rounded-xl shadow-neumorphic-sm bg-card font-medium text-muted-foreground transition-all duration-200",
                  "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                  "disabled:opacity-50"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "flex-1 h-12 rounded-xl shadow-neumorphic-sm bg-card font-medium text-accent transition-all duration-200",
                  "hover:shadow-neumorphic active:shadow-neumorphic-inset",
                  "ring-2 ring-accent/50",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "flex items-center justify-center gap-2"
                )}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
