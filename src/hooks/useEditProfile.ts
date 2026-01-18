import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EditProfileParams {
  profileId: string;
  updates: {
    name?: string;
    email?: string;
    phone?: string;
  };
  updateAuthEmail?: boolean; // If true and email changed, update auth user email too
}

export function useEditProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: EditProfileParams): Promise<void> => {
      const { profileId, updates, updateAuthEmail = false } = params;

      // Step 1: Get current profile to check if email changed
      const { data: currentProfile, error: fetchError } = await (supabase as any)
        .from("profiles")
        .select("email, user_id")
        .eq("id", profileId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch profile: ${fetchError.message}`);
      }

      const emailChanged = currentProfile.email !== updates.email;

      // Step 2: Update profile
      const profileUpdates: any = {};
      if (updates.name !== undefined) profileUpdates.name = updates.name.trim();
      if (updates.email !== undefined) profileUpdates.email = updates.email.trim() || null;
      if (updates.phone !== undefined) profileUpdates.phone = updates.phone.trim() || null;

      const { error: profileError } = await (supabase as any)
        .from("profiles")
        .update(profileUpdates)
        .eq("id", profileId);

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      // Step 3: Update auth user email if requested and email changed
      if (updateAuthEmail && emailChanged && updates.email && currentProfile.user_id) {
        const { error: authError } = await supabase.auth.admin.updateUserById(
          currentProfile.user_id,
          { email: updates.email }
        );

        if (authError) {
          // Log warning but don't fail - profile was updated successfully
          console.warn("Failed to update auth user email:", authError);
          toast.warning("Profile updated but email change in auth system failed");
        }
      }
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });
}
