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
      // Use Edge Function for user creation (has admin privileges)
      const { data, error } = await supabase.functions.invoke('create-test-user', {
        body: {
          email: params.profile.email || null,
          password: params.authUser?.password || null,
          name: params.profile.name.trim(),
          phone: params.profile.phone?.trim() || null,
          deviceIds: params.vehicles?.map(v => v.deviceId) || [],
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create user');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // The Edge Function returns the created user data
      const userId = data?.userId || data?.user?.id || null;
      const profileId = data?.profileId || data?.profile?.id;
      const assignedVehicles = data?.assignedVehicles || [];

      if (!profileId) {
        throw new Error('Failed to create profile: No profile ID returned');
      }

      return {
        userId,
        profileId,
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
