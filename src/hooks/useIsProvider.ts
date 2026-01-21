import { useAuth } from "@/contexts/AuthContext";

export function useIsProvider() {
  const { isProvider, isLoading, isRoleLoaded } = useAuth();
  return { isProvider: isProvider || false, isLoading: isLoading || !isRoleLoaded };
}
