import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OwnerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export function useOwnerProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["owner-profile", user?.id],
    queryFn: async (): Promise<OwnerProfile | null> => {
      if (!user) return null;

      const { data, error } = await (supabase
        .from("profiles" as any)
        .select("id, name, phone, email")
        .eq("user_id", user.id)
        .maybeSingle() as any);

      if (error) {
        console.error("Error fetching owner profile:", error);
        throw error;
      }

      return data as OwnerProfile | null;
    },
    enabled: !!user,
  });
}
