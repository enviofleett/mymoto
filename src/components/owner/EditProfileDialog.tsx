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
import { Loader2, User } from "lucide-react";
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
}

export function EditProfileDialog({ 
  open, 
  onOpenChange,
  onProfileUpdated 
}: EditProfileDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");

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
        .select("id, name, phone, email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setDisplayName(data.name || "");
        setPhone(data.phone || "");
      } else {
        // No profile yet, use email prefix as default name
        setDisplayName(user.email?.split("@")[0] || "");
        setPhone("");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
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
          <div className="space-y-4 py-2">
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
