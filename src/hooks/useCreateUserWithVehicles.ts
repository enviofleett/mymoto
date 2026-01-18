import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateUserWithVehiclesParams {
  profile: {
    name: string;
    email?: string;
    phone?: string;
  };
  authUser?: {
    password: string;
  } | null;
  vehicles?: Array<{
    deviceId: string;
    alias?: string;
  }>;
  sendEmail?: {
    to: string;
    userName: string;
    vehicleCount: number;
    isNewUser: boolean;
  };
}

interface CreateUserWithVehiclesResult {
  userId: string | null;
  profileId: string;
  assignedVehicles: string[];
}

export function useCreateUserWithVehicles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateUserWithVehiclesParams): Promise<CreateUserWithVehiclesResult> => {
      let userId: string | null = null;

      // Step 1: Create auth user if password provided
      if (params.authUser?.password && params.profile.email) {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: params.profile.email,
          password: params.authUser.password,
          email_confirm: true, // Auto-confirm for admin-created users
        });

        if (authError) {
          throw new Error(`Failed to create auth user: ${authError.message}`);
        }

        userId = authData.user.id;
      }

      // Step 2: Create profile
      const profileData = {
        name: params.profile.name.trim(),
        email: params.profile.email?.trim() || null,
        phone: params.profile.phone?.trim() || null,
        user_id: userId,
      };

      const { data: profile, error: profileError } = await (supabase as any)
        .from("profiles")
        .insert(profileData)
        .select()
        .single();

      if (profileError) {
        // If profile creation fails and we created an auth user, we can't easily rollback
        // But we can at least log the error
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      // Step 3: Assign vehicles if provided
      const assignedVehicles: string[] = [];
      if (params.vehicles && params.vehicles.length > 0) {
        const assignments = params.vehicles.map((v) => ({
          device_id: v.deviceId,
          profile_id: profile.id,
          vehicle_alias: v.alias?.trim() || null,
        }));

        const { error: assignError } = await (supabase as any)
          .from("vehicle_assignments")
          .insert(assignments);

        if (assignError) {
          // Log error but don't fail - vehicle assignment can be done later
          console.error("Failed to assign vehicles:", assignError);
          toast.warning("User created but vehicle assignment failed. You can assign vehicles later.");
        } else {
          assignedVehicles.push(...params.vehicles.map(v => v.deviceId));
        }
      }

      // Step 4: Send email notification if requested
      if (params.sendEmail) {
        try {
          const { sendVehicleAssignmentEmail } = await import("@/utils/email-helpers");
          await sendVehicleAssignmentEmail(
            params.sendEmail.to,
            {
              userName: params.sendEmail.userName,
              vehicleCount: params.sendEmail.vehicleCount,
              isNewUser: params.sendEmail.isNewUser,
            }
          );
        } catch (emailError: any) {
          console.error("[useCreateUserWithVehicles] Email notification error:", emailError);
          // Don't fail the operation if email fails
        }
      }

      return {
        userId,
        profileId: profile.id,
        assignedVehicles,
      };
    },
    onSuccess: (data, variables) => {
      const vehicleCount = data.assignedVehicles.length;
      const hasAuth = data.userId !== null;
      
      toast.success(
        `User created successfully${vehicleCount > 0 ? ` with ${vehicleCount} vehicle(s) assigned` : ""}`,
        {
          description: hasAuth 
            ? "User can now login with their email and password"
            : "Profile created. User can link their account when they sign up.",
        }
      );

      queryClient.invalidateQueries({ queryKey: ["profiles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles-with-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });
}
